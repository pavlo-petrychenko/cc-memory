"""Resolve a cwd to exactly one workspace (longest-prefix) + a worktree slug.

This is the encapsulation choke point: a session sees memory for the single
workspace returned here and nothing else. No match -> None -> no memory.
"""
import os
import subprocess

from . import registry


def resolve(cwd, path=registry.REGISTRY_PATH):
    """Return an expanded workspace dict with extra key '_prefix' (the matched
    prefix), or None if cwd is under no workspace. Longest prefix wins.
    """
    cwd = registry.expand(cwd)
    best = None
    best_len = -1
    for raw in registry.load(path):
        ws = registry.expand_ws(raw)
        for prefix in ws["match"]:
            if cwd == prefix or cwd.startswith(prefix + os.sep):
                if len(prefix) > best_len:
                    best_len = len(prefix)
                    best = dict(ws, _prefix=prefix)
    return best


def _git_toplevel(cwd):
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=3,
        )
        if out.returncode == 0:
            return registry.expand(out.stdout.strip())
    except Exception:
        pass
    return None


def _sanitize(slug):
    return "".join(c if (c.isalnum() or c in "-_.") else "-" for c in slug).strip("-") or "_root"


def slug(cwd, ws):
    """Worktree identity within a workspace.

    Prefers the git worktree root (so distinct git worktrees of one repo get
    distinct slugs, and subdirs of a repo collapse to the repo). Falls back to
    the path relative to the matched prefix.
    """
    cwd = registry.expand(cwd)
    prefix = ws["_prefix"]
    top = _git_toplevel(cwd)
    base = top if (top and (top == prefix or top.startswith(prefix + os.sep))) else cwd
    rel = os.path.relpath(base, prefix)
    if rel in (".", ""):
        return "_root"
    return _sanitize(rel.replace(os.sep, "-"))
