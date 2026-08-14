# knowledge/

Reads the KB vault: parsing a note's frontmatter/title/tags/relations
(`note/`) and building the feature map injected at SessionStart (`kbMap/`).

Owns no filesystem access of its own beyond what `kbMap.service.ts` needs to
scan a vault's top level — everything else is text in, typed data out.
