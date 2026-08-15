# jsonFile

Reads and writes a JSON file whose top level is an object, without needing to
understand every field — `settings.json` and `installed.json` both carry keys
this installer doesn't own and must round-trip untouched.

A missing file reads as `{}` (equivalent to "nothing configured yet"); a
present file that fails to parse, or isn't an object, is a typed
`JsonFileError`, never a thrown exception.

Writes are atomic: `<path>.tmp` then rename, so a reader never observes a
half-written file. Output is always two-space-indented JSON plus a trailing
newline, so a hand-edited file diffs quietly on everything untouched.

Used by every install step that persists JSON (`settings`, `manifest`).
