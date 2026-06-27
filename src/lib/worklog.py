"""Worklog (short-term/episodic memory) paths, templates, and helpers.

Two files per worktree under <kb>/_Worklogs/<slug>/:
  STATE.md     - living: current focus + open threads (injected on start)
  <date>.md    - append-only journal, one entry per session wrap
"""
import os
import subprocess

STATE_TEMPLATE = """\
---
type: worktree-state
workspace: {workspace}
worktree: {slug}
updated: {date}
---
# {slug} — working state

## Current focus
_(nothing yet)_

## Open threads
- [ ] _(none)_

## Working notes (ephemeral, not yet KB)
- _(none)_
"""

ENTRY_TEMPLATE = """\
## {time} — {topic}
**Changes:** {changes}
**Learned:** {learned}
**Decided:** {decided}
**Open:** {open}
**Refs:** {refs}
"""


def worktree_dir(ws, slug):
    return os.path.join(ws["worklogs"], slug)


def state_path(ws, slug):
    return os.path.join(worktree_dir(ws, slug), "STATE.md")


def dated_path(ws, slug, date):
    return os.path.join(worktree_dir(ws, slug), f"{date}.md")


def proposals_dir(ws):
    return os.path.join(ws["worklogs"], "_proposals")


def ensure_dir(ws, slug):
    d = worktree_dir(ws, slug)
    os.makedirs(d, exist_ok=True)
    return d


def read_state(ws, slug):
    p = state_path(ws, slug)
    if os.path.isfile(p):
        try:
            with open(p, encoding="utf-8") as fh:
                return fh.read()
        except Exception:
            return None
    return None


def recent_entries(ws, slug, limit=2):
    """Return [(date, text), …] for the most recent dated journal files."""
    d = worktree_dir(ws, slug)
    if not os.path.isdir(d):
        return []
    files = sorted(
        (f for f in os.listdir(d) if f.endswith(".md") and f != "STATE.md"),
        reverse=True,
    )[:limit]
    out = []
    for f in files:
        try:
            with open(os.path.join(d, f), encoding="utf-8") as fh:
                out.append((f[:-3], fh.read()))
        except Exception:
            pass
    return out


def append_to_dated(ws, slug, date, text):
    """Append raw text to <date>.md (used by deterministic hooks). Returns path."""
    ensure_dir(ws, slug)
    p = dated_path(ws, slug, date)
    with open(p, "a", encoding="utf-8") as fh:
        if os.path.getsize(p) if os.path.exists(p) else 0:
            fh.write("\n")
        fh.write(text.rstrip() + "\n")
    return p


def git_commit_worklogs(ws, message):
    """Commit worklog changes in the KB git repo (local only). Best-effort."""
    kb = ws["kb"]
    if not os.path.isdir(os.path.join(kb, ".git")):
        return False
    try:
        rel = os.path.relpath(ws["worklogs"], kb)
        subprocess.run(["git", "-C", kb, "add", "--", rel],
                       capture_output=True, timeout=10)
        # Nothing staged -> commit returns non-zero; that's fine.
        subprocess.run(["git", "-C", kb, "commit", "-m", message],
                       capture_output=True, timeout=10)
        return True
    except Exception:
        return False
