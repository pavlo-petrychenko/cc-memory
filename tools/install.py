#!/usr/bin/env python3
"""Idempotent installer for cc-memory.

Wires the repo into Claude Code:
  - symlink `memory` CLI onto PATH (~/.local/bin)
  - symlink skills into ~/.claude/skills (backing up any pre-existing real dir)
  - register the 5 hooks in ~/.claude/settings.json (preserving buddy-reroll &
    plan-review; removing the legacy obsidian-kb-index SessionStart entry)
  - seed ~/.claude/memory/registry.toml with an example workspace if absent
  - install + load the launchd reflector agent

Safe to run repeatedly. Only registers hooks whose script files exist, so it can
be run at any point during the build.
"""
import json
import os
import shutil
import stat
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
SRC = os.path.join(REPO, "src")
HOME = os.path.expanduser("~")
CLAUDE = os.path.join(HOME, ".claude")
SETTINGS = os.path.join(CLAUDE, "settings.json")
SKILLS = os.path.join(CLAUDE, "skills")
LOCALBIN = os.path.join(HOME, ".local", "bin")
LA = os.path.join(HOME, "Library", "LaunchAgents")
PLIST_ID = "dev.ccmemory.reflector"

# event -> (script filename, timeout)
HOOKS = {
    "SessionStart": ("session-start.py", 10),
    "UserPromptSubmit": ("memory-inject.py", 15),
    "Stop": ("wrap-gate.py", 15),
    "PostCompact": ("compact-checkpoint.py", 15),
    "SessionEnd": ("worklog-floor.py", 15),
}


def log(msg):
    print(f"  {msg}")


def _ensure_exec(path):
    st = os.stat(path)
    os.chmod(path, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def symlink_force(src, dst, backup=True):
    if os.path.islink(dst):
        if os.path.realpath(dst) == os.path.realpath(src):
            return "ok"
        os.unlink(dst)
    elif os.path.exists(dst):
        if not backup:
            return "exists"
        bak = dst + ".pre-ccmemory.bak"
        if not os.path.exists(bak):
            shutil.move(dst, bak)
            log(f"backed up existing {os.path.basename(dst)} -> {os.path.basename(bak)}")
        else:
            shutil.rmtree(dst) if os.path.isdir(dst) else os.remove(dst)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    os.symlink(src, dst)
    return "linked"


def install_cli():
    os.makedirs(LOCALBIN, exist_ok=True)
    src = os.path.join(SRC, "bin", "memory")
    _ensure_exec(src)
    symlink_force(src, os.path.join(LOCALBIN, "memory"), backup=False)
    log("memory CLI -> ~/.local/bin/memory")


def install_skills():
    sk = os.path.join(SRC, "skills")
    if not os.path.isdir(sk):
        return
    os.makedirs(SKILLS, exist_ok=True)
    for name in sorted(os.listdir(sk)):
        s = os.path.join(sk, name)
        if os.path.isdir(s):
            symlink_force(s, os.path.join(SKILLS, name))
            log(f"skill {name}")


def _group(cmd, timeout):
    return {"hooks": [{"type": "command", "command": cmd, "timeout": timeout}]}


def _cmd_in_groups(groups, needle):
    for g in groups:
        for h in g.get("hooks", []):
            if needle in h.get("command", ""):
                return True
    return False


def _is_ours(group):
    """A hook group we manage: any cc-memory hook (at any path) or the legacy one."""
    for h in group.get("hooks", []):
        c = h.get("command", "")
        if "cc-memory" in c or "obsidian-kb-index.py" in c:
            return True
    return False


def install_hooks():
    settings = {}
    if os.path.isfile(SETTINGS):
        with open(SETTINGS) as fh:
            settings = json.load(fh)
    hooks = settings.setdefault("hooks", {})
    # Purge any prior cc-memory/legacy entries first (self-heals moves/renames),
    # preserving everything else (buddy-reroll, plan-review, …).
    removed = 0
    for event in list(hooks.keys()):
        kept = [g for g in hooks[event] if not _is_ours(g)]
        removed += len(hooks[event]) - len(kept)
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]
    if removed:
        log(f"purged {removed} stale cc-memory/legacy hook entr"
            f"{'y' if removed == 1 else 'ies'}")
    # Re-register at the current location.
    for event, (fname, timeout) in HOOKS.items():
        script = os.path.join(SRC, "hooks", fname)
        if not os.path.isfile(script):
            continue
        _ensure_exec(script)
        hooks.setdefault(event, []).append(_group(script, timeout))
        log(f"hook {event} -> {fname}")
    os.makedirs(CLAUDE, exist_ok=True)
    tmp = SETTINGS + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(settings, fh, indent=2)
        fh.write("\n")
    os.replace(tmp, SETTINGS)


def seed_registry():
    reg = os.path.join(CLAUDE, "memory", "registry.toml")
    if os.path.exists(reg):
        log("registry exists (left as-is)")
        return
    os.makedirs(os.path.dirname(reg), exist_ok=True)
    shutil.copy(os.path.join(REPO, "registry.example.toml"), reg)
    log(f"seeded registry -> {reg} (edit paths / run `memory workspace add`)")


def install_launchd():
    tmpl = os.path.join(REPO, "runners", f"{PLIST_ID}.plist")
    if not os.path.isfile(tmpl):
        return
    with open(tmpl) as fh:
        content = fh.read()
    path_env = ":".join([LOCALBIN, "/opt/homebrew/bin", "/usr/local/bin",
                         "/usr/bin", "/bin", "/usr/sbin", "/sbin"])
    repl = {
        "@PYTHON@": sys.executable,
        "@MEMORYSCRIPT@": os.path.join(SRC, "bin", "memory"),
        "@PATH@": path_env,
        "@LOG@": os.path.join(CLAUDE, "memory", "reflector.log"),
        "@MEMORY@": os.path.join(LOCALBIN, "memory"),
    }
    for k, v in repl.items():
        content = content.replace(k, v)
    os.makedirs(LA, exist_ok=True)
    dst = os.path.join(LA, f"{PLIST_ID}.plist")
    with open(dst, "w") as fh:
        fh.write(content)
    uid = os.getuid()
    subprocess.run(["launchctl", "bootout", f"gui/{uid}/{PLIST_ID}"], capture_output=True)
    r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", dst], capture_output=True, text=True)
    log(f"launchd agent {'loaded' if r.returncode == 0 else 'installed (load manually)'} -> {dst}")


def main():
    print("Installing cc-memory…")
    install_cli()
    install_skills()
    install_hooks()
    seed_registry()
    install_launchd()
    print("Done. Open a new Claude Code session under a registered workspace to use it.")


if __name__ == "__main__":
    main()
