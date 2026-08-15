# knowledge/

Reads the KB vault: parsing a note's frontmatter/title/tags/relations
(`note/`) and building the feature map injected at SessionStart (`kbMap/`).

Owns no filesystem access of its own beyond what `kbMap.service.ts` needs to
scan a vault's top level — everything else is text in, typed data out.

`kbMap/`: a missing vault directory is a filesystem concern, so
`kbMap.service.ts` returns `null` rather than the formatter emitting an
empty-vault message — the caller decides what "no map at all" means.

`note/`: parsing is pure — text in, typed data out. Callers supply the
fallback title (the note's filename stem); this module has no notion of
paths. A feature's index note is parsed separately from a general note,
since it reads a note's body shape differently.
