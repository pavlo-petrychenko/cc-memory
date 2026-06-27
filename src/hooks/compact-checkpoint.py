#!/usr/bin/env python3
"""PostCompact hook: persist the compaction summary into working memory.

When Claude Code compacts, it generates `compact_summary`; we save it to today's
worklog journal so the distilled context survives the context reset
("assume interruption, checkpoint before clear"). WRITES ONLY. Fails open.
"""
import datetime
import json
import os
import sys

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import resolve, worklog  # noqa: E402


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}
    summary = (payload.get("compact_summary") or "").strip()
    if not summary:
        return
    cwd = payload.get("cwd") or os.getcwd()
    ws = resolve.resolve(cwd)
    if not ws:
        return
    slug = resolve.slug(cwd, ws)
    date = datetime.date.today().isoformat()
    trigger = payload.get("trigger", "")
    block = (f"<!-- compaction checkpoint ({trigger or 'auto'}) -->\n"
             f"**Compaction summary:**\n\n{summary}")
    try:
        worklog.append_to_dated(ws, slug, date, block)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
