"""Per-workspace SQLite FTS5 index (derived, disposable, rebuildable).

Source of truth is the markdown vault; this is just a fast lookup. One index.db
per workspace, OUTSIDE the vault. BM25 full-text over notes + a parsed wikilink
graph + a separate FTS table for recent worklogs. No vectors (Phase 5).
"""
import os
import re
import sqlite3

_FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_WIKILINK = re.compile(r"\[\[([^\]]+)\]\]")
_TYPED_REL = re.compile(r"^\s*-\s+([a-z_]+)\s+\[\[([^\]]+)\]\]", re.MULTILINE)
_INLINE_TAG = re.compile(r"(?:^|\s)#([A-Za-z][\w/-]*)")
_TITLE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
# A raw word-chunk from arbitrary text (keeps underscores so we can split them
# ourselves); _CAMEL then breaks camelCase / acronym boundaries within a chunk.
_CHUNK = re.compile(r"[A-Za-z0-9_]+")
_CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")

# Bump when the FTS schema/tokenizer changes; build() detects a lower stored
# `PRAGMA user_version` and does a one-time full rebuild (the DB is derived).
SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS notes(
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE,
  title TEXT,
  type TEXT,
  importance INTEGER,
  mtime REAL
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, body, tags, path UNINDEXED, tokenize = 'porter unicode61'
);
CREATE TABLE IF NOT EXISTS links(
  src_path TEXT, rel_type TEXT, dst TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS worklog_fts USING fts5(
  slug, date, body, path UNINDEXED, tokenize = 'porter unicode61'
);
"""


def connect(ws):
    db = ws["index_db"]
    os.makedirs(os.path.dirname(db), exist_ok=True)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)  # create anything missing (fresh DB gets the current tokenizer)
    return conn


def _schema_version(conn):
    return conn.execute("PRAGMA user_version").fetchone()[0]


def _reset_schema(conn):
    """Drop our derived tables and recreate them at the current schema. Safe: the
    markdown vault is the source of truth, so build() repopulates from scratch."""
    conn.executescript(
        "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS notes_fts; "
        "DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS worklog_fts;")
    conn.executescript(SCHEMA)
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


def _parse_frontmatter(text):
    m = _FRONTMATTER.match(text)
    fm, body = {}, text
    if m:
        body = text[m.end():]
        for line in m.group(1).splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                fm[k.strip()] = v.strip().strip("'\"")
    return fm, body


def parse_note(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    fm, body = _parse_frontmatter(text)
    tm = _TITLE.search(body)
    title = tm.group(1) if tm else os.path.splitext(os.path.basename(path))[0]
    tags = set(_INLINE_TAG.findall(body))
    if fm.get("tags"):
        tags.update(t.strip() for t in re.split(r"[,\s]+", fm["tags"].strip("[]")) if t.strip())
    rels = [(r, d.split("|")[0].strip()) for r, d in _TYPED_REL.findall(body)]
    typed_targets = {d for _, d in rels}
    for raw in _WIKILINK.findall(body):
        tgt = raw.split("|")[0].strip()
        if tgt not in typed_targets:
            rels.append(("links_to", tgt))
    try:
        importance = int(fm.get("importance", "")) if fm.get("importance") else None
    except ValueError:
        importance = None
    return {
        "title": title, "type": fm.get("type", "note"),
        "importance": importance, "body": body,
        "tags": " ".join(sorted(tags)), "rels": rels,
    }


def _excluded(rel, exclude):
    parts = rel.split(os.sep)
    if any(p.startswith(".") for p in parts):
        return True
    for ex in exclude:
        ex = ex.strip("/")
        if rel == ex or rel.startswith(ex + os.sep):
            return True
    return False


def _walk_md(root, exclude):
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        rel_dir = "" if rel_dir == "." else rel_dir
        dirnames[:] = [
            d for d in dirnames
            if not _excluded(os.path.join(rel_dir, d) if rel_dir else d, exclude)
        ]
        for f in filenames:
            if f.endswith(".md"):
                yield os.path.join(dirpath, f)


def build(ws, incremental=True, verbose=False):
    conn = connect(ws)
    if _schema_version(conn) < SCHEMA_VERSION:
        _reset_schema(conn)      # tokenizer/schema changed -> one-time full rebuild
        incremental = False
    kb, exclude = ws["kb"], ws.get("exclude", [])
    added = updated = removed = 0
    seen = set()
    if os.path.isdir(kb):
        existing = {r["path"]: (r["id"], r["mtime"]) for r in conn.execute("SELECT id, path, mtime FROM notes")}
        for path in _walk_md(kb, exclude):
            seen.add(path)
            mtime = os.path.getmtime(path)
            if incremental and path in existing and abs(existing[path][1] - mtime) < 1e-6:
                continue
            try:
                n = parse_note(path)
            except Exception:
                continue
            cur = conn.execute(
                "INSERT INTO notes(path,title,type,importance,mtime) VALUES(?,?,?,?,?) "
                "ON CONFLICT(path) DO UPDATE SET title=excluded.title, type=excluded.type, "
                "importance=excluded.importance, mtime=excluded.mtime RETURNING id",
                (path, n["title"], n["type"], n["importance"], mtime),
            )
            nid = cur.fetchone()[0]
            conn.execute("DELETE FROM notes_fts WHERE rowid=?", (nid,))
            conn.execute("INSERT INTO notes_fts(rowid,title,body,tags,path) VALUES(?,?,?,?,?)",
                         (nid, n["title"], n["body"], n["tags"], path))
            conn.execute("DELETE FROM links WHERE src_path=?", (path,))
            conn.executemany("INSERT INTO links(src_path,rel_type,dst) VALUES(?,?,?)",
                             [(path, r, d) for r, d in n["rels"]])
            if path in existing:
                updated += 1
            else:
                added += 1
    # prune deleted
    for path, (nid, _m) in list((r["path"], (r["id"], r["mtime"])) for r in conn.execute("SELECT id,path,mtime FROM notes")):
        if path not in seen:
            conn.execute("DELETE FROM notes WHERE id=?", (nid,))
            conn.execute("DELETE FROM notes_fts WHERE rowid=?", (nid,))
            conn.execute("DELETE FROM links WHERE src_path=?", (path,))
            removed += 1
    _build_worklogs(conn, ws)
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    conn.close()
    return {"added": added, "updated": updated, "removed": removed, "total": total}


def _build_worklogs(conn, ws):
    conn.execute("DELETE FROM worklog_fts")
    root = ws["worklogs"]
    if not os.path.isdir(root):
        return
    for slug in os.listdir(root):
        d = os.path.join(root, slug)
        if not os.path.isdir(d) or slug.startswith("."):
            continue
        for f in os.listdir(d):
            if f.endswith(".md"):
                p = os.path.join(d, f)
                try:
                    with open(p, encoding="utf-8") as fh:
                        body = fh.read()
                except Exception:
                    continue
                date = f[:-3] if f != "STATE.md" else "STATE"
                conn.execute("INSERT INTO worklog_fts(slug,date,body,path) VALUES(?,?,?,?)",
                             (slug, date, body, p))


_STOP = {"the", "and", "for", "you", "with", "that", "this", "have", "what",
         "how", "why", "can", "are", "was", "but", "not", "from", "your", "all",
         "any", "into", "out", "use", "using", "get", "got", "let", "lets"}


def _keep(tok):
    return len(tok) >= 2 and not tok.isdigit() and tok not in _STOP


def _subtokens(chunk):
    """Expand one raw word-chunk into FTS-matchable terms. The vault's unicode61
    tokenizer splits `snake_case`/`kebab`/`dotted` at index time but leaves
    camelCase glued; so for symmetry we emit BOTH the glued form (matches a
    camelCase note) AND the camel/underscore-split parts (match snake/kebab/spaced
    notes). Porter stemming on top is handled by FTS on both sides."""
    out = set()
    glued = chunk.replace("_", "").lower()
    if _keep(glued):
        out.add(glued)
    for part in _CAMEL.findall(chunk):
        p = part.lower()
        if _keep(p):
            out.add(p)
    return out


def salient_tokens(text):
    """Distinct lowercased query terms extracted from arbitrary prompt text."""
    toks = set()
    for chunk in _CHUNK.findall(text):
        toks |= _subtokens(chunk)
    return toks


def fts_query(text):
    """Build a safe FTS5 MATCH query (OR over salient tokens, each quoted)."""
    return " OR ".join(f'"{t}"' for t in sorted(salient_tokens(text))[:32])


def search(ws, query, limit=5, kind="notes"):
    """Return ranked hits [{path,title,snippet,score}]. `query` may be raw text."""
    conn = connect(ws)
    match = query if re.search(r'["*]| OR | AND ', query) else fts_query(query)
    if not match.strip():
        conn.close()
        return []
    try:
        if kind == "worklog":
            # column weights: slug, date, body
            rows = conn.execute(
                "SELECT path, slug AS title, snippet(worklog_fts,2,'','','…',12) AS snip, "
                "bm25(worklog_fts, 3.0, 1.0, 1.0) AS score FROM worklog_fts WHERE worklog_fts MATCH ? "
                "ORDER BY score LIMIT ?", (match, limit)).fetchall()
        else:
            # column weights: title, body, tags (title/tags hits outrank body)
            rows = conn.execute(
                "SELECT path, title, snippet(notes_fts,1,'','','…',12) AS snip, "
                "bm25(notes_fts, 10.0, 1.0, 5.0) AS score FROM notes_fts WHERE notes_fts MATCH ? "
                "ORDER BY score LIMIT ?", (match, limit)).fetchall()
    except sqlite3.OperationalError:
        conn.close()
        return []
    out = [{"path": r["path"], "title": r["title"],
            "snippet": " ".join(r["snip"].split()), "score": r["score"]} for r in rows]
    conn.close()
    return out


def neighbors(ws, path, limit=8):
    """1-hop wikilink neighbors of a note (by link target name)."""
    conn = connect(ws)
    names = [r["dst"] for r in conn.execute("SELECT dst FROM links WHERE src_path=? LIMIT ?", (path, limit))]
    conn.close()
    return names


def _relkey(path, kb):
    rel = os.path.relpath(path, kb) if path.startswith(kb) else path
    return rel[:-3] if rel.endswith(".md") else rel


def rerank_by_links(ws, hits, boost=None):
    """Reorder BM25 hits using the wikilink graph: a hit that is linked-to by
    ANOTHER hit in the same result set is corroborated, so it gets a small
    strength boost. Pure reordering — never introduces new notes (keeps the
    precision the score-floor is after). `hits` carry bm25 `score` (lower=better).
    """
    if len(hits) < 2:
        return hits
    if boost is None:
        boost = float(os.environ.get("CCMEM_LINK_BOOST", "0.5"))
    kb = ws["kb"]
    # resolve a wikilink dst name -> a candidate hit path (try full relpath, then basename)
    by_rel, by_base = {}, {}
    for h in hits:
        rk = _relkey(h["path"], kb)
        by_rel[rk] = h["path"]
        by_base[os.path.basename(rk)] = h["path"]
    cand = {h["path"] for h in hits}
    indeg = {h["path"]: 0 for h in hits}
    conn = connect(ws)
    qmarks = ",".join("?" * len(cand))
    try:
        for row in conn.execute(
                f"SELECT src_path, dst FROM links WHERE src_path IN ({qmarks})", list(cand)):
            dst = row["dst"].split("|")[0].strip()
            tgt = by_rel.get(dst) or by_base.get(os.path.basename(dst))
            if tgt and tgt in indeg and tgt != row["src_path"]:
                indeg[tgt] += 1
    finally:
        conn.close()
    # bm25 score is negative (lower=better); subtracting the boost makes a
    # corroborated hit "better". Stable sort preserves BM25 order among ties.
    return sorted(hits, key=lambda h: h["score"] - boost * indeg[h["path"]])
