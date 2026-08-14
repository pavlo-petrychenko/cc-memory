# skills

Symlinks every directory under `<repo>/src/skills` into `~/.claude/skills`.

Idempotency comes from the `manifest`, not the filesystem: the `FileSystem`
port has no `readlink`/`lstat`, so there is no portable way to ask "is this
already our symlink?". A skill recorded in the manifest is trusted and left
alone (re-linked only if it vanished); a skill with no prior record gets a
pre-existing REAL directory backed up to `<name>.pre-ccmemory.bak` once,
before its first link.
