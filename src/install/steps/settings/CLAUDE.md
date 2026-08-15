# settings

Owns the `~/.claude/settings.json` surgery: purge every hook group this
installer previously registered (by exact command string via `manifest`,
plus a one-time legacy-substring fallback), then re-register the five hooks
at their current bun/dist location.

Every foreign top-level key and hook group — anything not ours — is
preserved byte-for-byte, including its position in the file.

`diffLines` renders a before/after diff for `--dry-run`; it is never used on
the real write path, which serializes the surgery result directly.
