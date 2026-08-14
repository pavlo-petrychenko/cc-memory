# slug

String munging with no filesystem semantics: trimming an arbitrary character
set, turning a free-form candidate into a filesystem-safe worktree slug, and
Title Case for identifiers.

`sanitizeSlug` always returns either `_root` or a string made only of
`[A-Za-z0-9._-]` (plus any Unicode letter/digit) — never empty.
