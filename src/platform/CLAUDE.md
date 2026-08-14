# platform

The only place in the codebase that touches the outside world: the filesystem,
git, subprocesses, SQLite, the log file, the process environment, and stdio.
One folder per port — each pairs a `*.typedefs.ts` interface with the one real
implementation behind it, so a test can swap in a fake from `src/testing/`
without touching the port's consumers.

`container/` is the composition root: `makeRealContainer` builds every real
adapter once and bundles them into a `Container`, the single value threaded
into services, commands and hooks. Nothing outside `platform/` constructs an
adapter directly — code depends on the port type, never the concrete adapter.

`openDatabase` on `Container` is a factory, not a field: the index database
path is per-workspace, and it memoizes so the same path always returns the
same open handle within a process.

Only role-suffixed files (`.adapter.ts`, `.container.ts`) or code living here
may import a `node:*`/`bun:*` builtin — everywhere else in the codebase that
is a purity violation.
