# core

The shared kernel: vocabulary and dependency-free helpers every module may use.
No module may be imported *by* core — it depends on nothing else in `src/`.

Owns `AbsPath`, `Result`, `JsonValue`/`JsonRecord` (`core.typedefs.ts`);
`RawWorkspace`/`Workspace`/`WorktreeSlug` (`domain.typedefs.ts`); env-tunable
parsing (`config/`); and path/slug string helpers (`utils/`).

`Workspace` types live here rather than in a `core/workspace/` submodule, to
avoid confusion with the top-level `workspace/` module that resolves and
persists them.
