"""Workspace registry: read/write/validate ~/.claude/memory/registry.toml.

A workspace is a dict with keys: id, match (list of cwd prefixes), kb, worklogs,
exclude (list), index_db. Paths are stored verbatim (with ~ preserved) for
portability; callers expand via `expand_ws`.

tomllib is read-only, so writing uses a tiny serializer for our fixed schema.
"""
import os
import tomllib

REGISTRY_PATH = os.path.expanduser("~/.claude/memory/registry.toml")

REQUIRED_KEYS = ("id", "match", "kb", "worklogs", "index_db")


def expand(p):
    """Expand ~ and normalize a single path string."""
    return os.path.normpath(os.path.expanduser(p))


def tildify(p):
    """Collapse $HOME back to ~ for tidy storage in the registry."""
    p = os.path.normpath(p)
    home = os.path.expanduser("~")
    if p == home:
        return "~"
    if p.startswith(home + os.sep):
        return "~" + p[len(home):]
    return p


def load(path=REGISTRY_PATH):
    """Return the list of raw workspace dicts (empty if no registry yet)."""
    if not os.path.isfile(path):
        return []
    with open(path, "rb") as fh:
        data = tomllib.load(fh)
    return data.get("workspace", [])


def expand_ws(ws):
    """Return a copy of a workspace with all paths expanded/normalized."""
    out = dict(ws)
    out["match"] = [expand(m) for m in ws.get("match", [])]
    out["kb"] = expand(ws["kb"])
    out["worklogs"] = expand(ws["worklogs"])
    out["index_db"] = expand(ws["index_db"])
    out["exclude"] = list(ws.get("exclude", []))
    return out


def find(ws_id, path=REGISTRY_PATH):
    for ws in load(path):
        if ws["id"] == ws_id:
            return ws
    return None


def _q(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _arr(items):
    return "[" + ", ".join(_q(i) for i in items) + "]"


def dumps(workspaces):
    blocks = []
    for ws in workspaces:
        lines = [
            "[[workspace]]",
            f"id = {_q(ws['id'])}",
            f"match = {_arr(ws.get('match', []))}",
            f"kb = {_q(ws['kb'])}",
            f"worklogs = {_q(ws['worklogs'])}",
            f"exclude = {_arr(ws.get('exclude', []))}",
            f"index_db = {_q(ws['index_db'])}",
        ]
        blocks.append("\n".join(lines))
    header = (
        "# cc-memory workspace registry (managed by `memory workspace …`).\n"
        "# Paths may use ~; they are expanded at load time. One block per workspace.\n\n"
    )
    return header + "\n\n".join(blocks) + ("\n" if blocks else "")


def save(workspaces, path=REGISTRY_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(dumps(workspaces))
    os.replace(tmp, path)


def _is_under(child, parent):
    child, parent = expand(child), expand(parent)
    return child == parent or child.startswith(parent + os.sep)


def validate_new(ws, existing):
    """Raise ValueError if `ws` conflicts with `existing` workspaces.

    Guards encapsulation: unique id, no overlapping match prefix, no kb nested
    inside another workspace's kb (or vice-versa).
    """
    for key in REQUIRED_KEYS:
        if not ws.get(key):
            raise ValueError(f"workspace is missing required field: {key}")
    for other in existing:
        if other["id"] == ws["id"]:
            raise ValueError(f"workspace id '{ws['id']}' already exists")
        for m_new in ws["match"]:
            for m_old in other["match"]:
                if _is_under(m_new, m_old) or _is_under(m_old, m_new):
                    raise ValueError(
                        f"match prefix '{m_new}' overlaps workspace "
                        f"'{other['id']}' prefix '{m_old}'"
                    )
        if _is_under(ws["kb"], other["kb"]) or _is_under(other["kb"], ws["kb"]):
            raise ValueError(
                f"kb '{ws['kb']}' is nested with workspace '{other['id']}' "
                f"kb '{other['kb']}'"
            )
