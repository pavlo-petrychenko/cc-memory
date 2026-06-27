#!/usr/bin/env python3
"""SessionStart hook: inject the resolved workspace's KB index + this worktree's
working memory (STATE.md). Registry-driven successor to obsidian-kb-index.py.

Self-scopes by cwd: if cwd is under no workspace, emits nothing. Fails open.
Also runs a fast incremental reindex so search/auto-inject are fresh.
"""
import json
import os
import re
import sys

_SRC = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, _SRC)
from lib import resolve, registry, worklog, index  # noqa: E402

DAILY = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
MAX_DESC = 200


def clean(text):
    text = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)
    text = text.replace("**", "").replace("`", "")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > MAX_DESC:
        text = text[:MAX_DESC].rsplit(" ", 1)[0] + "…"
    return text


def parse_main_note(path):
    title = desc = epic = ""
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except Exception:
        return title, desc, epic
    i = 0
    if lines and lines[0].strip() == "---":
        i = 1
        while i < len(lines) and lines[i].strip() != "---":
            m = re.match(r"\s*epic:\s*(.+)$", lines[i])
            if m:
                epic = m.group(1).strip().strip("'\"")
            i += 1
        i += 1
    quote = []
    for line in lines[i:]:
        s = line.strip()
        if not title and s.startswith("# "):
            title = re.sub(r"\s*[—-]\s*Knowledge Base Index\s*$", "",
                           s[2:].strip()).strip()
            continue
        if s.startswith(">"):
            quote.append(s.lstrip(">").strip())
        elif quote:
            break
    if quote:
        desc = clean(" ".join(quote))
    return title, desc, epic


def build_kb_index(ws):
    kb = ws["kb"]
    if not os.path.isdir(kb):
        return ""
    exclude = set(ws.get("exclude", []))
    entries = sorted(os.listdir(kb), key=str.lower)
    feature_dirs = [e for e in entries
                    if os.path.isdir(os.path.join(kb, e))
                    and not e.startswith(".") and e not in exclude]
    loose = [e for e in entries if e.endswith(".md") and not DAILY.match(e)]

    out = ["# Obsidian KB index (auto-injected at session start)", "",
           f"Top level of the vault at `{registry.tildify(kb)}`. This is the map "
           "only — when a topic below matches your task, open that folder's notes "
           "via the `obsidian` MCP and follow the wikilinks. Capture new durable, "
           "feature-level knowledge with the `save-learning` skill (writes need "
           "approval).", "", "## Features"]
    for d in feature_dirs:
        main = os.path.join(kb, d, f"{d}.md")
        title, desc, epic = parse_main_note(main) if os.path.isfile(main) else ("", "", "")
        line = f"- **{d}**"
        if title and title.lower() != d.lower():
            line += f" ({title})"
        if desc:
            line += f" — {desc}"
        elif not os.path.isfile(main):
            line += " — _(no index note yet)_"
        if epic:
            line += f"  · epic `{epic}`"
        out.append(line)
    if loose:
        out.append("")
        out.append("## Loose top-level notes")
        for n in loose:
            out.append(f"- {n[:-3]}")
    return "\n".join(out)


def build_working_memory(ws, slug):
    state = worklog.read_state(ws, slug)
    head = f"# Working memory — workspace `{ws['id']}`, worktree `{slug}`"
    if state:
        return (head + "\n\n" + state.strip() +
                "\n\n_(Update this at wrap with the `remember` skill.)_")
    return (head + "\n\n_No working memory yet for this worktree._ Start one with "
            "the `remember` skill (it writes `STATE.md` + a dated journal entry).")


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
    try:
        index.build(ws, incremental=True)
    except Exception:
        pass
    slug = resolve.slug(cwd, ws)
    parts = [build_kb_index(ws), build_working_memory(ws, slug)]
    context = "\n\n---\n\n".join(p for p in parts if p)
    if not context:
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart", "additionalContext": context}}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
