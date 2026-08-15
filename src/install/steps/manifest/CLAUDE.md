# manifest

Owns `~/.claude/memory/installed.json`: a record of exactly what the last
install run wrote (hook commands, shim path, skills, the one settings.json
backup, and whether the one-time legacy hook purge has run).

This is what lets `settings` purge hook groups by their EXACT former command
string instead of guessing from a substring, so a moved or renamed repo never
leaves orphaned entries, and lets `uninstall` reverse exactly what was
installed rather than something inferred.

A missing, corrupt, or pre-manifest-era file all parse to `null` — "no
manifest yet" — never a thrown error.
