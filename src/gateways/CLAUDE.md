# gateways

The only place in the codebase that touches the outside world: the filesystem,
git, subprocesses, SQLite, the log file, the process environment, and stdio.
One folder per port — each pairs a `*.typedefs.ts` interface with the one real
implementation behind it, so a test can swap in a fake from `src/testing/`
without touching the port's consumers.

`gateways.container.ts` is the composition root: `AppContainer` builds every real
adapter once and bundles them into a `Container` (`gateways.typedefs.ts`), the
single value threaded into services, commands and hooks. Nothing outside
`gateways/` constructs an adapter directly — code depends on the port type,
never the concrete adapter.

`openDatabase` on `Container` is a factory, not a field: the index database
path is per-workspace, and it memoizes so the same path always returns the
same open handle within a process.

Only role-suffixed files (`.adapter.ts`, `.container.ts`) or code living here
may import a `node:*`/`bun:*` builtin — everywhere else in the codebase that
is a purity violation.

Per-port notes: `clock`'s `today`/`timeHHMM` read the system's **local**
calendar day and clock, not UTC. `env`'s `home()`/`cwd()` return an `AbsPath`
directly since `os.homedir()`/`process.cwd()` are always absolute already;
`repoRoot()` derives the repo root from `import.meta.url` for install/doctor
to locate the bundled artifact's own checkout. `fileSystem`'s `mkdir`/`remove`
are recursive and idempotent. `git` is implemented over `proc`, never
`child_process` directly, and every read-only method returns an empty string
on a non-zero exit or thrown error rather than raising. `logger`'s real
adapter is a size-capped, rotating file; `appendWithRotation` is exported
standalone because the same rotation primitive also backs non-log writes.
`proc`'s non-zero exit is a normal `ProcResult`, not a rejection — only a
timeout or missing binary rejects, and a missing binary resolves exit 127
instead of throwing. `sqlite` holds one `bun:sqlite` handle per process with a
prepared-statement cache keyed by the SQL string itself — safe because every
SQL string this project runs is a literal constant, never built by
concatenating untrusted input; `getUserVersion`/`setUserVersion` wrap `PRAGMA
user_version`, the schema check that decides whether the index needs a full
rebuild. It is **never faked** — FTS5's porter stemmer, `bm25()` weighting and
`NEAR` semantics are the behavior under test, so tests open a real
`:memory:` database via `SqliteAdapter`. `stdio` is what lets a hook
entrypoint be tested with a fake stdin and no real process exit.
