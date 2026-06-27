#!/usr/bin/env python3
"""UserPromptSubmit hook: auto-retrieve relevant memory for the prompt.

Runs a BM25 search (this workspace's index only) keyed to salient tokens in the
prompt and injects the top hits as context — so the agent gets relevant KB notes
without having to remember to search. Threshold-gated: chit-chat injects nothing.
Fails open.
"""
import json
import os
import sys

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import resolve, index, registry  # noqa: E402

MAX_NOTES = 4
MAX_WORKLOG = 1
MIN_TOKENS = 2


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

    tokens = [t for t in {m.lower() for m in index._TOKEN.findall(prompt)} if t not in index._STOP]
    if len(tokens) < MIN_TOKENS:
        return

    try:
        notes = index.search(ws, prompt, limit=MAX_NOTES, kind="notes")
        wl = index.search(ws, prompt, limit=MAX_WORKLOG, kind="worklog")
    except Exception:
        return
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
