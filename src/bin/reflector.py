#!/usr/bin/env python3
"""Reflector: distil worklog candidates into proposed KB changes.

Off the hot path (launchd/cron). Reads WORKLOGS ONLY (never transcripts), so it's
cheap. Gathers #promote / Learned / Decided lines since the last run, asks a model
to decide ADD/UPDATE/INVALIDATE/NOOP against existing KB notes, and writes a
review file. It NEVER writes the KB and NEVER commits — the user approves via the
`consolidate-review` skill.

Usage: reflector.py --workspace <id> [--if-due] [--threshold-hours 20]
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import registry, index, worklog  # noqa: E402

PROMOTE = re.compile(r"#promote\b")
FIELD = re.compile(r"^\s*\*\*(Learned|Decided)\:\*\*\s*(.+)$", re.IGNORECASE)
IMPORTANCE_MIN = 4


def last_reflect_path(ws):
    return os.path.join(os.path.dirname(ws["index_db"]), ".last-reflect")


def is_due(ws, threshold_hours):
    p = last_reflect_path(ws)
    if not os.path.exists(p):
        return True
    try:
        last = float(open(p).read().strip())
    except Exception:
        return True
    import time
    return (time.time() - last) >= threshold_hours * 3600


def stamp(ws):
    import time
    with open(last_reflect_path(ws), "w") as fh:
        fh.write(str(time.time()))


def gather_candidates(ws, since):
    root = ws["worklogs"]
    out = []
    if not os.path.isdir(root):
        return out
    for slug in sorted(os.listdir(root)):
        d = os.path.join(root, slug)
        if not os.path.isdir(d) or slug.startswith(".") or slug == "_proposals":
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".md") or f == "STATE.md":
                continue
            p = os.path.join(d, f)
            if since and os.path.getmtime(p) < since:
                continue
            try:
                text = open(p, encoding="utf-8").read()
            except Exception:
                continue
            for line in text.splitlines():
                s = line.strip()
                if PROMOTE.search(s):
                    t = PROMOTE.sub("", s)
                    t = re.sub(r"^\s*[-*]*\s*\*\*[A-Za-z]+:\*\*\s*", "", t)  # drop leading **Field:**
                    out.append({"text": t.strip(" -*"), "src": f"{slug}/{f}"})
                else:
                    m = FIELD.match(s)
                    if m and len(m.group(2).strip()) > 12:
                        out.append({"text": m.group(2).strip(), "src": f"{slug}/{f}"})
    # de-dupe identical texts
    seen, uniq = set(), []
    for c in out:
        k = c["text"].lower()
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq


def related_notes(ws, candidates, limit=10):
    query = " ".join(c["text"] for c in candidates)
    hits = index.search(ws, query, limit=limit, kind="notes")
    return [{"title": h["title"],
             "path": os.path.relpath(h["path"], ws["kb"]) if h["path"].startswith(ws["kb"]) else h["path"],
             "snippet": h["snippet"]} for h in hits]


PROMPT = """\
You are the consolidation reflector for a personal engineering knowledge base.
You decide whether short-term worklog notes should become durable KB knowledge.

KB rules: knowledge is feature/project-specific, NEVER task-specific; atomic
(one fact per note); reusable beyond the originating task. Contradictions
invalidate the old note (set superseded_by), never hard-delete.

For EACH candidate, choose exactly one action:
- ADD: a new durable, reusable fact not yet covered. Provide a folder, title, and body.
- UPDATE: extends/clarifies an existing note. Provide the existing note path and what to change.
- INVALIDATE: contradicts an existing note. Provide the existing note path + the corrected fact.
- NOOP: task-specific, trivial, or already covered. (Most casual notes are NOOP.)

Score importance 1-10 (durability x reusability). Be conservative; prefer NOOP
and fewer, higher-quality proposals. Merge duplicates across candidates.

Respond with ONLY a JSON array, each item:
{"action","title","folder","path","body","importance","rationale","source"}
(path = existing note for UPDATE/INVALIDATE; folder = target folder for ADD.)

## Candidates
%s

## Existing related KB notes
%s
"""


def decide_with_llm(candidates, related):
    cand_txt = "\n".join(f"- ({c['src']}) {c['text']}" for c in candidates)
    rel_txt = "\n".join(f"- {r['title']} [{r['path']}]: {r['snippet']}" for r in related) or "(none)"
    prompt = PROMPT % (cand_txt, rel_txt)
    try:
        r = subprocess.run(["claude", "-p", prompt], capture_output=True, text=True, timeout=240)
        if r.returncode != 0:
            return None, f"claude -p failed: {r.stderr.strip()[:200]}"
        out = r.stdout.strip()
        m = re.search(r"\[.*\]", out, re.DOTALL)
        if not m:
            return None, "no JSON array in model output"
        return json.loads(m.group(0)), None
    except FileNotFoundError:
        return None, "claude CLI not found"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def write_proposals(ws, date, decisions, candidates, error=None):
    pdir = worklog.proposals_dir(ws)
    os.makedirs(pdir, exist_ok=True)
    path = os.path.join(pdir, f"{date}.md")
    lines = [f"# Consolidation proposals — {ws['id']} — {date}", "",
             "Review with the `consolidate-review` skill. Approved items are written "
             "to the KB via `save-learning` (your approval). Nothing here is in the KB yet.", ""]
    if error:
        lines += [f"> ⚠ LLM decision step unavailable ({error}). Raw candidates listed "
                  "for manual triage.", "", "## Raw candidates"]
        lines += [f"- [ ] ({c['src']}) {c['text']}" for c in candidates]
        _write(path, lines)
        return path, len(candidates)

    kept = [d for d in decisions if d.get("action") in ("ADD", "UPDATE", "INVALIDATE")
            and int(d.get("importance", 0) or 0) >= IMPORTANCE_MIN]
    noops = [d for d in decisions if d.get("action") == "NOOP"]
    if not kept:
        lines += ["_No promotions proposed (all NOOP / below importance threshold)._"]
    for d in kept:
        tgt = d.get("path") or f"{d.get('folder','')}/{d.get('title','')}.md".lstrip("/")
        lines += [f"## [ ] {d['action']}: {d.get('title','(untitled)')}  ·  importance {d.get('importance')}",
                  f"- **Target:** `{tgt}`",
                  f"- **Why:** {d.get('rationale','')}",
                  f"- **Source:** {d.get('source','')}",
                  "- **Body:**", "  ```markdown", *( "  " + ln for ln in (d.get('body','') or '').splitlines()), "  ```", ""]
    if noops:
        lines += ["", f"<!-- {len(noops)} candidates judged NOOP -->"]
    _write(path, lines)
    return path, len(kept)


def _write(path, lines):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_brief(ws, date, candidates, related):
    """Write the consolidation brief the interactive session reads."""
    pdir = worklog.proposals_dir(ws)
    os.makedirs(pdir, exist_ok=True)
    path = os.path.join(pdir, f"_brief-{date}.md")
    lines = [f"# Consolidation brief — {ws['id']} — {date}", "",
             "Distilled from worklogs since the last run. For each candidate decide "
             "ADD / UPDATE / INVALIDATE / NOOP against the existing KB; propose, then "
             "apply approved ones via `save-learning` (ask before any KB write).", "",
             "## Candidates"]
    lines += [f"- ({c['src']}) {c['text']}" for c in candidates]
    lines += ["", "## Existing related KB notes"]
    lines += [f"- {r['title']} [{r['path']}]: {r['snippet']}" for r in related] or ["(none)"]
    _write(path, lines)
    return path


def _tmux(*args):
    return subprocess.run(["tmux", *args], capture_output=True, text=True)


def tmux_available():
    return shutil.which("tmux") is not None


def tmux_has_session(name):
    return _tmux("has-session", "-t", name).returncode == 0


_SHELLS = {"zsh", "-zsh", "bash", "-bash", "sh", "-sh", "fish", "-fish", "dash"}


def tmux_session_active(name):
    """True if the session's active pane is running something other than a bare
    shell — i.e. a consolidation (claude) is still in progress. A leftover shell
    (claude already exited but the session lingers) counts as stale/inactive."""
    r = _tmux("display-message", "-p", "-t", name, "#{pane_current_command}")
    cmd = (r.stdout or "").strip().lower()
    if not cmd:
        return True  # unknown -> assume active, don't disturb
    return cmd not in _SHELLS


def spawn_consolidation(ws, brief, session):
    """Launch a DETACHED tmux session running interactive consolidation.

    The user attaches with `tmux attach -t <session>` to assist/approve. KB writes
    require approval, so an unattended session simply waits.
    """
    cwd = ws["match"][0]                      # under the workspace -> resolves here
    shell = os.environ.get("SHELL", "/bin/zsh")
    # --dangerously-skip-permissions removes the trust/permission FRICTION so the
    # session runs unattended; the prompt still tells Claude to confirm KB writes.
    cmd_bin = os.environ.get("CCMEM_CONSOLIDATE_CMD", "claude --dangerously-skip-permissions")
    prompt = (
        f"cc-memory consolidation for the {ws['id']} workspace. Read the brief at "
        f"{brief} . For each candidate decide ADD, UPDATE, INVALIDATE or NOOP against "
        f"the existing KB (use memory-search to check). Propose the changes, then apply "
        f"only the ones I approve via the save-learning skill. Do NOT write to the KB "
        f"without my explicit approval. When finished, run memory reindex.")
    inner = (f"{cmd_bin} '{prompt}'; echo; "
             f"echo '[cc-memory consolidation finished -- Ctrl-b d to detach]'; exec {shell}")
    r = _tmux("new-session", "-d", "-s", session, "-c", cwd, "sh", "-c", inner)
    return r.returncode == 0, (r.stderr or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", required=True)
    ap.add_argument("--if-due", action="store_true")
    ap.add_argument("--threshold-hours", type=int, default=20)
    ap.add_argument("--headless", action="store_true",
                    help="decide via `claude -p` and write a proposals file instead of a tmux session")
    ap.add_argument("--force", action="store_true",
                    help="replace an existing consolidation session even if it looks active")
    a = ap.parse_args()

    raw = registry.find(a.workspace)
    if not raw:
        sys.exit(f"no such workspace: {a.workspace}")
    ws = registry.expand_ws(raw)

    if a.if_due and not is_due(ws, a.threshold_hours):
        print(f"{a.workspace}: not due, skipping")
        return

    try:
        index.build(ws, incremental=True)
    except Exception:
        pass

    since = 0
    lp = last_reflect_path(ws)
    if os.path.exists(lp):
        try:
            since = float(open(lp).read().strip())
        except Exception:
            since = 0

    candidates = gather_candidates(ws, since)
    date = datetime.date.today().isoformat()
    if not candidates:
        print(f"{a.workspace}: no candidates since last run")
        stamp(ws)
        return

    related = related_notes(ws, candidates)

    # Default: interactive consolidation in tmux (you can attend/assist).
    if not a.headless and tmux_available():
        session = f"cc-consolidate-{ws['id']}"
        if tmux_has_session(session):
            if not a.force and tmux_session_active(session):
                print(f"{a.workspace}: consolidation already running -> "
                      f"tmux attach -t {session}  (or rerun with --force)")
                return  # active session: leave candidates pending; don't restamp
            _tmux("kill-session", "-t", session)  # stale leftover (or --force): replace
            print(f"{a.workspace}: replaced {'existing' if a.force else 'stale'} "
                  f"consolidation session")
        brief = write_brief(ws, date, candidates, related)
        ok, err = spawn_consolidation(ws, brief, session)
        if ok:
            stamp(ws)
            print(f"{a.workspace}: {len(candidates)} candidates -> interactive "
                  f"consolidation in tmux '{session}'. Attach: tmux attach -t {session}\n"
                  f"  brief: {brief}")
            return
        print(f"{a.workspace}: tmux spawn failed ({err}); falling back to headless")

    # Fallback: headless decision + proposals file.
    decisions, err = decide_with_llm(candidates, related)
    path, n = write_proposals(ws, date, decisions or [], candidates, error=err)
    stamp(ws)
    print(f"{a.workspace}: {len(candidates)} candidates -> {n} proposal(s) "
          f"{'(raw, LLM unavailable) ' if err else ''}-> {path}")


if __name__ == "__main__":
    main()
