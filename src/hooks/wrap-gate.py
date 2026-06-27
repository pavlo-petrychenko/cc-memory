#!/usr/bin/env python3
"""Stop hook: the wrap-gate — make sure work gets captured before finishing.

When meaningful (uncommitted) work exists and the worktree's STATE.md hasn't been
refreshed since, remind the agent to run `remember`. Starts as a NON-BLOCKING
nudge; escalates to a hard block only after repeated stops with large drift.

Guards: respects `stop_hook_active` (never loops), keys a per-session marker that
resets when the work signature changes (so it fires at most once per batch).
Tunables via env: CCMEM_BLOCK_AFTER (default 2), CCMEM_BLOCK_DRIFT (default 5),
CCMEM_GATE_DISABLE=1 to disable blocking entirely. Fails open.
"""
import json
import os
import subprocess
import sys
import time

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import resolve, worklog  # noqa: E402

BLOCK_AFTER = int(os.environ.get("CCMEM_BLOCK_AFTER", "2"))
BLOCK_DRIFT = int(os.environ.get("CCMEM_BLOCK_DRIFT", "5"))
DISABLE_BLOCK = os.environ.get("CCMEM_GATE_DISABLE") == "1"


def _git(cwd, *args):
    try:
        r = subprocess.run(["git", "-C", cwd, *args], capture_output=True,
                           text=True, timeout=5)
        return r.stdout if r.returncode == 0 else ""
    except Exception:
        return ""


def _emit_nudge(text):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "Stop", "additionalContext": text}}))


def _emit_block(reason):
    print(json.dumps({"decision": "block", "reason": reason}))


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}
    if payload.get("stop_hook_active"):
        return  # we already prompted this turn; never loop
    cwd = payload.get("cwd") or os.getcwd()
    session_id = payload.get("session_id") or "nosession"
    ws = resolve.resolve(cwd)
    if not ws:
        return

    dirty = [ln for ln in _git(cwd, "status", "--porcelain").splitlines() if ln.strip()]
    dirty_count = len(dirty)
    head = (_git(cwd, "rev-parse", "HEAD").strip() or "nogit")[:12]
    marker = os.path.join(os.path.dirname(ws["index_db"]), f".wrap-{session_id}")

    if dirty_count == 0:
        try:
            os.remove(marker)
        except OSError:
            pass
        return  # nothing uncommitted to capture

    sig = f"{head}:{dirty_count}"
    slug = resolve.slug(cwd, ws)
    state = worklog.state_path(ws, slug)
    state_mtime = os.path.getmtime(state) if os.path.exists(state) else 0

    prev = {}
    if os.path.exists(marker):
        try:
            with open(marker) as fh:
                prev = json.load(fh)
        except Exception:
            prev = {}

    # Already captured: STATE refreshed after our last prompt for this same sig.
    if prev.get("sig") == sig and state_mtime > prev.get("ts", 0):
        return

    nudges = prev.get("nudges", 0) + 1 if prev.get("sig") == sig else 1
    try:
        os.makedirs(os.path.dirname(marker), exist_ok=True)
        with open(marker, "w") as fh:
            json.dump({"sig": sig, "ts": time.time(), "nudges": nudges}, fh)
    except Exception:
        pass

    where = f"`{slug}` ({dirty_count} uncommitted file{'s' if dirty_count != 1 else ''})"
    if (not DISABLE_BLOCK) and nudges >= BLOCK_AFTER and dirty_count >= BLOCK_DRIFT:
        _emit_block(
            f"Before you finish: capture this session in working memory for {where}. "
            "Run the `remember` skill — write today's worklog entry with a **summary "
            "of ALL changes you made**, plus Learned/Decided/Open (tag durable "
            "findings #promote), and refresh STATE.md. Worklogs need no approval.")
    else:
        _emit_nudge(
            f"📝 Unsaved work in {where}. Consider running the `remember` skill to "
            "update this worktree's worklog (summary of changes + open threads) "
            "before finishing.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
