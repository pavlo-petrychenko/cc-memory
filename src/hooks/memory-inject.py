#!/usr/bin/env python3
"""UserPromptSubmit hook: auto-retrieve relevant memory for the prompt.

Runs a BM25 search (this workspace's index only) keyed to salient tokens in the
prompt and injects the top hits as context — so the agent gets relevant KB notes
without having to remember to search. Threshold-gated: chit-chat injects nothing.
Fails open.
"""
import datetime
import json
import os
import sys

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import resolve, index, registry  # noqa: E402

MAX_NOTES = 4
MAX_WORKLOG = 1
MIN_TOKENS = 2
POOL = 8  # BM25 candidates fetched before link-rerank + score-floor trim to MAX_NOTES
# Score floor: keep a hit only if its BM25 strength (-score) clears this. Tunable;
# calibrate from inject.jsonl. 0 = inject any match (old behavior).
MIN_SCORE = float(os.environ.get("CCMEM_INJECT_MIN_SCORE", "0.2"))


def _relto(path, base):
    return os.path.relpath(path, base) if path.startswith(base) else path


def _log(ws, cwd, prompt, tokens, note_pool, wl, injected_notes, injected_wl):
    """Append one JSONL row of what retrieval saw/did — the data to tune ranking
    and the score floor. Disable with CCMEM_INJECT_LOG=0. Fails open."""
    if os.environ.get("CCMEM_INJECT_LOG") == "0":
        return
    try:
        rec = {
            "ts": datetime.datetime.now().isoformat(timespec="seconds"),
            "ws": ws["id"], "cwd": cwd, "prompt": prompt[:500],
            "tokens": sorted(tokens)[:40],
            "candidates": [{"p": _relto(h["path"], ws["kb"]), "s": round(h["score"], 4)} for h in note_pool],
            "worklog": [{"p": _relto(h["path"], ws["worklogs"]), "s": round(h["score"], 4)} for h in wl],
            "injected": {"notes": [_relto(h["path"], ws["kb"]) for h in injected_notes],
                         "worklog": [_relto(h["path"], ws["worklogs"]) for h in injected_wl]},
        }
        p = os.path.join(os.path.dirname(ws["index_db"]), "inject.jsonl")
        with open(p, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}
    prompt = (payload.get("prompt") or "").strip()
    cwd = payload.get("cwd") or os.getcwd()
    if len(prompt) < 12:
        return
    ws = resolve.resolve(cwd)
    if not ws:
        return

    tokens = index.salient_tokens(prompt)
    if len(tokens) < MIN_TOKENS:
        return

    try:
        pool = index.search_fused(ws, prompt, limit=POOL, kind="notes")
        wl_pool = index.search_fused(ws, prompt, limit=MAX_WORKLOG, kind="worklog")
    except Exception:
        return

    # score floor (strength = -bm25; lower bm25 = stronger match), then trim.
    notes = [h for h in pool if -h["score"] >= MIN_SCORE][:MAX_NOTES]
    wl = [h for h in wl_pool if -h["score"] >= MIN_SCORE][:MAX_WORKLOG]
    _log(ws, cwd, prompt, tokens, pool, wl_pool, notes, wl)
    if not notes and not wl:
        return

    lines = [f"Relevant memory (auto-retrieved from workspace `{ws['id']}` — "
             "pointers; open the file for detail, ignore if off-topic):"]
    for h in notes:
        rel = os.path.relpath(h["path"], ws["kb"]) if h["path"].startswith(ws["kb"]) else h["path"]
        lines.append(f"- **{h['title']}** — {h['snippet']}  ·  `{rel}`")
    for h in wl:
        rel = os.path.relpath(h["path"], ws["worklogs"]) if h["path"].startswith(ws["worklogs"]) else h["path"]
        lines.append(f"- _(worklog)_ {h['title']}: {h['snippet']}  ·  `{rel}`")

    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": "\n".join(lines)}}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
