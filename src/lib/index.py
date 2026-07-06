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


RRF_K = 60                                                    # standard RRF constant
LINK_RRF = float(os.environ.get("CCMEM_LINK_BOOST", "0.003"))  # per corroborating in-link, in RRF units
PHRASE_WINDOW = 8                                             # NEAR proximity window (tokens)


def _ordered_terms(text):
    """Salient terms in prompt order (for building adjacency pairs). Unlike
    salient_tokens (a set), this keeps sequence and per-chunk sub-word order."""
    out = []
    for chunk in _CHUNK.findall(text):
        parts = [p.lower() for p in _CAMEL.findall(chunk) if _keep(p.lower())]
        if parts:
            out.extend(parts)
        else:
            glued = chunk.replace("_", "").lower()
            if _keep(glued):
                out.append(glued)
    return out


def phrase_query(text, window=PHRASE_WINDOW):
    """FTS5 NEAR clauses over adjacent salient-term pairs, OR'd together. Rewards
    proximity ("salient tokens" as a phrase, not just both words somewhere).
    Empty string when there are fewer than two ordered terms."""
    terms = _ordered_terms(text)
    seen, clauses = set(), []
    for a, b in zip(terms, terms[1:]):
        if a == b:
            continue
        clause = f'NEAR("{a}" "{b}", {window})'
        if clause not in seen:
            seen.add(clause)
            clauses.append(clause)
    return " OR ".join(clauses[:24])


# One SQL per kind. Column weights: notes = title 10 / body 1 / tags 5;
# worklog = slug 3 / date 1 / body 1. snippet() draws from the body column.
_SQL = {
    "notes": ("SELECT path, title, snippet(notes_fts,1,'','','…',12) AS snip, "
              "bm25(notes_fts, 10.0, 1.0, 5.0) AS score FROM notes_fts "
              "WHERE notes_fts MATCH ? ORDER BY score LIMIT ?"),
    "worklog": ("SELECT path, slug AS title, snippet(worklog_fts,2,'','','…',12) AS snip, "
                "bm25(worklog_fts, 3.0, 1.0, 1.0) AS score FROM worklog_fts "
                "WHERE worklog_fts MATCH ? ORDER BY score LIMIT ?"),
}


def _run(ws, match, limit, kind):
    """Execute one prebuilt FTS5 MATCH. Returns [{path,title,snippet,score}]."""
    if not match or not match.strip():
        return []
    conn = connect(ws)
    try:
        rows = conn.execute(_SQL[kind], (match, limit)).fetchall()
    except sqlite3.OperationalError:
        return []
    finally:
        conn.close()
    return [{"path": r["path"], "title": r["title"],
             "snippet": " ".join(r["snip"].split()), "score": r["score"]} for r in rows]


def search(ws, query, limit=5, kind="notes"):
    """Single BM25 query over one workspace. `query` is natural text: it is always
    tokenized/sanitized via fts_query and never interpreted as raw FTS5 syntax, so
    any prompt (incl. one containing OR/AND/NEAR/quotes) is safe and never errors."""
    return _run(ws, fts_query(query), limit, kind)


def search_fused(ws, query, limit=5, kind="notes", links=True):
    """Proximity-aware retrieval: fuse a token-OR ranking with a phrase/NEAR
    ranking via Reciprocal Rank Fusion (k=60), plus a small wikilink-corroboration
    bonus. Returns hits ordered by the fused `rank_score`; each still carries the
    token-query bm25 `score` (the injection floor keys off that). Degrades to pure
    BM25 when the prompt yields no adjacent-token pair. The RRF core here is the
    same machinery a future BM25×embeddings fusion would reuse."""
    pool = max(limit * 3, 10)
    tok = search(ws, query, limit=pool, kind=kind)
    if not tok:
        return []
    # Phrase matches are a subset of token matches (NEAR requires both terms), so
    # the token list is the complete candidate set; phrase only adds rank weight.
    phr = _run(ws, phrase_query(query), pool, kind)
    rank_p = {h["path"]: i for i, h in enumerate(phr)}
    inl = _inlink_counts(ws, [h["path"] for h in tok]) if links else {}
    fused = []
    for i, h in enumerate(tok):
        s = 1.0 / (RRF_K + i + 1)
        if h["path"] in rank_p:
            s += 1.0 / (RRF_K + rank_p[h["path"]] + 1)
        s += LINK_RRF * inl.get(h["path"], 0)
        fused.append({**h, "rank_score": s})
    fused.sort(key=lambda x: -x["rank_score"])
    return fused[:limit]


def neighbors(ws, path, limit=8):
    """1-hop wikilink neighbors of a note (by link target name)."""
    conn = connect(ws)
    names = [r["dst"] for r in conn.execute("SELECT dst FROM links WHERE src_path=? LIMIT ?", (path, limit))]
    conn.close()
    return names


def _relkey(path, kb):
    rel = os.path.relpath(path, kb) if path.startswith(kb) else path
    return rel[:-3] if rel.endswith(".md") else rel


def _inlink_counts(ws, paths):
    """For a candidate set, count how many OTHER candidates link to each one (via
    a wikilink dst resolved to a candidate path). Feeds the RRF corroboration
    bonus in search_fused. Returns {path: in-degree-within-set}."""
    if len(paths) < 2:
        return {}
    kb = ws["kb"]
    by_rel, by_base = {}, {}
    for p in paths:
        rk = _relkey(p, kb)
        by_rel[rk] = p
        by_base[os.path.basename(rk)] = p
    cand = set(paths)
    indeg = {p: 0 for p in paths}
    conn = connect(ws)
    try:
        qmarks = ",".join("?" * len(cand))
        for row in conn.execute(
                f"SELECT src_path, dst FROM links WHERE src_path IN ({qmarks})", list(cand)):
            dst = row["dst"].split("|")[0].strip()
            tgt = by_rel.get(dst) or by_base.get(os.path.basename(dst))
            if tgt and tgt in indeg and tgt != row["src_path"]:
                indeg[tgt] += 1
    finally:
        conn.close()
    return indeg
