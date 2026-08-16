# core

The shared kernel — vocabulary and dependency-free helpers every module may use.
Depends on nothing else in `src/`.

- `core.typedefs.ts` — `AbsPath`, `Result`, `JsonValue`/`JsonRecord`
- `domain.typedefs.ts` — `RawWorkspace`/`Workspace`/`WorktreeSlug`
- `config/` — `CCMEM_*` tunable parsing (env arrives as a parameter, never read here)
- `utils/` — path/slug helpers; the codebase's only `as AbsPath` assertion
- `entry/` — CLI outcome vocabulary, `@Command`/`@Hook`, token helpers
- `search/` — pure ranking math (C7): tokenizer, ftsQuery builder, RRF ranker
