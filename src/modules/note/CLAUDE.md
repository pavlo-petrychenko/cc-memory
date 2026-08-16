# modules/note

Durable knowledge: notes under `<kb>/**/*.md` (the truth), plus their derived
index (`notes`/`notes_fts`/`links`) reached through the `SearchIndex` port.

`note.repository.ts` reads markdown; `projection/` writes and reads the index
(bm25 10/1/5, contract C7); `services/` parses notes and builds the KB map;
`useCases/` are `searchNotes`, `listNotes`, `buildKbMap`, `reprojectNotes`.
Command: `notes`.
