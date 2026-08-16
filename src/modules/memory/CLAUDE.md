# modules/memory

User-facing memory operations: resolve the target workspace, then search,
reindex, or list its notes and worklogs. Composes note/, worklog/, kb/ and
workspace/ services; owns no storage of its own.

- `useCases/` — searchMemory, reindexMemory, listNotes, sessionStart, injectMemory
- `commands/` — search, reindex, notes
- `hooks/` — session-start and memory-inject resolvers
