#!/usr/bin/env python3
"""SessionEnd hook: deterministic worklog floor.

Appends a zero-token git/command skeleton to today's worklog journal so even a
killed session leaves a record. WRITES ONLY — never commits (commits are manual
via `memory commit`). Fails open.
"""
import datetime
import json
import os
import subprocess
import sys

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import resolve, worklog  # noqa: E402


def _git(cwd, *args, timeout=5):
    try:
        r = subprocess.run(["git", "-C", cwd, *args], capture_output=True,
                           text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}
    cwd = payload.get("cwd") or os.getcwd()
    ws = resolve.resolve(cwd)
    if not ws:
        return
    slug = resolve.slug(cwd, ws)
    date = datetime.date.today().isoformat()

    branch = _git(cwd, "rev-parse", "--abbrev-ref", "HEAD")
    diffstat = _git(cwd, "diff", "--stat")
    staged = _git(cwd, "diff", "--cached", "--stat")
    recent = _git(cwd, "log", "-5", "--oneline")
    reason = payload.get("reason", "")

    lines = [f"<!-- auto (SessionEnd {date}, reason={reason or 'n/a'}) -->"]
    if branch:
        lines.append(f"<!-- branch: {branch} -->")
    tail = (diffstat or staged or "").strip().splitlines()[-1:] if (diffstat or staged) else []
    if tail:
        lines.append(f"<!-- uncommitted: {tail[0].strip()} -->")
    if recent:
        lines.append("<!-- recent commits:")
        lines.extend("  " + ln for ln in recent.splitlines())
        lines.append("-->")
    if len(lines) == 1:
        lines.append("<!-- no git activity detected -->")
    try:
        worklog.append_to_dated(ws, slug, date, "\n".join(lines))
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
