# cc-memory — working agreement

Persistent, layered, per-workspace memory for Claude Code: markdown vaults as the
source of truth, a derived SQLite FTS5 index, five Claude Code hooks, six skills and
a nightly reflector.

**Right now this repo is mid-migration**: a reviewed Python PoC is being rewritten in
TypeScript on Bun with full test coverage. Branch `ts-migration`, one PR at the end.
The approved plan (25 documents: contracts, architecture, conventions, a verbatim
constants reference, and 11 work packets) lives at
`~/.claude/plans/abstract-exploring-pixel.md`. **Read your packet and the reference
doc before writing code.**

## The five invariants (never violate)

1. **Files are the source of truth. The index is derived and disposable.** Anything
   in `index.db` can be thrown away and rebuilt from the vault. Never treat it as
   storage.
2. **cwd → exactly one workspace is the isolation boundary.** Longest-prefix match;
   no match means *no memory at all*. Never read across workspaces.
3. **Hooks fail open.** A hook must never break a session: catch everything, always
   `exit(0)`. But always log the failure — silent breakage is what we're fixing.
4. **Nothing auto-commits, and nothing writes the KB without the user's approval.**
   Worklogs are free; KB writes are approval-gated.
5. **The agent that did the work authors its own memory.** Hooks capture and enforce;
   they don't summarize.

## Frozen contracts

Changing any of these is a breaking change to a live install. Full detail + line
references live in the plan's *Frozen Contracts* and *Porting Reference* docs.

| | Contract |
|---|---|
| C1 | `~/.claude/memory/registry.toml` schema, `~` preserved on write |
| C2 | Hook stdin/stdout JSON per event; **always exit 0** |
| C3 | `memory` CLI surface and output shape — the six skills parse it |
| C4 | Vault file formats: `STATE.md`, `<date>.md` entries, proposals, brief |
| C5 | `CCMEM_*` env var names and defaults |
| C6 | Installed surface: `~/.local/bin/memory`, launchd label, index location |
| C7 | Retrieval semantics: `porter unicode61`, bm25 weights 10/1/5 and 3/1/1, RRF k=60, compound-split tokens |

`index.db`'s schema is explicitly **not** frozen — bump `SCHEMA_VERSION` and it
rebuilds itself.

## Porting discipline

- **Port, don't reinvent.** The Python is still in the tree until the cutover packet.
  Your packet names its source as `file:line`. Read it, translate it, keep its
  behavior — including its quirks. Reproduce an odd behavior and pin it with a test
  unless it is on the plan's bug-fix list.
- **Never re-derive a constant.** Every number, regex, SQL string, bm25 weight,
  threshold and template is transcribed in the plan's *Porting Reference*. Copy from
  there. If something you need is missing, ask — do not guess.
- **Agent-visible text is a contract.** Injected context, nudges, proposals files and
  CLI output are copied verbatim, character for character.
- **Stay inside your packet.** No drive-by refactors of files another packet owns.
- **The dependency list is closed**: `smol-toml`, `yaml`, `bun:sqlite`, plus dev
  tooling. Adding a dependency needs a conversation.
- **Never edit `*.py`.** Read-only until the cutover packet deletes them.

## Architecture — modules, not layers

The top level of `src/` is the list of things this project *is*. Everything one
feature needs lives in one directory: its types, its pure logic, its services, its
renderers, and its CLI command.

```
src/
  core/        the shared kernel every module may use — Result, AbsPath, paths,
               Config, Workspace. Pure. Depends on nothing.
  platform/    the ONLY place that touches the outside world: 8 *.port.ts
               interfaces, 8 *.adapter.ts implementations, and container.ts.
  workspace/   the registry, cwd→workspace resolution, worktree slugs
  retrieval/   tokenizing, query building, ranking, the SQLite index, search
  knowledge/   vault notes: frontmatter/wikilink parsing and the KB map
  worklog/     STATE.md + the dated journal, and promotion candidates
  reflect/     the nightly consolidation reflector
  install/     wiring into Claude Code, and doctor (which diagnoses an install)
  session/     the five Claude Code hooks and their shared fail-open runtime
  cli/         the composition shell: arg parsing, dispatch, output formatting
```

**Dependency direction.** Every module may use `core/`; only role-suffixed files may
use `platform/`; `cli/` may use every module; **no two modules may import each
other**. A cycle means they are really one module wearing two names — enforced by
`tests/unit/purity.test.ts`.

**The purity rule, enforced by the same test.** Purity used to be guaranteed by
`domain/` being a directory. Now it lives in the filename:

> A file may reference `platform/` or a node/bun builtin **only** if it is a
> `.service.ts`, `.command.ts`, `.hook.ts`, `.adapter.ts` or `.port.ts` — or lives in
> `platform/`. Everything else is pure: dates, times, paths and file contents arrive
> as parameters.

`cli/main.ts` is the single allowed exception, as the composition root. Purity is why
~90% of the suite needs no fakes, no temp dirs and no clock — protect it.

Two consequences worth internalizing:

- **Ranking is pure.** `retrieval/rank.ts` takes already-fetched hit arrays and
  returns fused hits. No SQL anywhere near it.
- **Every agent-visible byte comes from a pure `*.renderer.ts`**, so contract tests
  are exact string assertions rather than end-to-end guesswork.

## File naming

Not Python style — no `kebab-case.ts`. The suffix carries meaning: it tells you
whether a file can touch the outside world before you open it.

| Kind | Convention | Examples |
|---|---|---|
| Types / enums / models | `PascalCase.ts` | `Workspace.ts`, `HookResult.ts`, `Config.ts`, `Result.ts` |
| Pure logic / renderers | `camelCase.ts`, `camelCase.renderer.ts` | `tokenize.ts`, `paths.ts`, `rank.ts`, `kbMap.renderer.ts` |
| May do I/O | `camelCase.<role>.ts` | `registry.service.ts`, `search.command.ts`, `wrapGate.hook.ts`, `fsReal.adapter.ts`, `fileSystem.port.ts` |
| Tests | mirror the subject | `tokenize.test.ts`, `registry.service.test.ts` |

Roles in use: `.port`, `.adapter`, `.service`, `.renderer`, `.hook`, `.command`,
`.fake`. Adding I/O to a pure file means **renaming it** to `.service.ts`, which makes
the change visible in every diff and import that references it.

## Code style

- **No magic strings — use enums.** Any string that is really a closed set of cases
  gets a TypeScript `enum` (or, for wire formats, an enum whose values are the exact
  protocol strings). Never compare against a bare literal.

  ```ts
  export enum HookResultKind { Silent = "silent", Context = "context", Block = "block" }
  export enum HookEvent {
    SessionStart = "SessionStart",
    UserPromptSubmit = "UserPromptSubmit",
    Stop = "Stop",
    PostCompact = "PostCompact",
    SessionEnd = "SessionEnd",
  }
  ```

  (This is why `erasableSyntaxOnly` is deliberately **off** in `tsconfig.json`:
  enums are not erasable, and we bundle with Bun rather than Node type-stripping.)

- **Readable names, always.** No one-letter variables, no vague generics (`data`,
  `info`, `res`, `tmp`, `handle`, `doStuff`). Name the thing: `noteRelativePath`,
  `dirtyFileCount`, `fusedHits`, `matchedPrefix`.
- **No nested or clever ternaries.** One level, both branches trivial, or use `if`.
  Lint enforces `no-nested-ternary` and `max-depth: 4`.
- **Errors are returned, not thrown, across module boundaries** — a `Result<T, E>`
  with a typed error union per boundary (`RegistryError`, `PayloadError`, …). Throwing
  is for genuinely unreachable states.
- **Parse untrusted input at the boundary into a named type.** No `unknown` or `any`
  in a signature, no `Record<string, unknown>` bags passed around. anti-slop enforces
  this; it is not negotiable.
- `readonly` on type fields and arrays; `type` over `interface`; named exports only;
  one concern per file.
- **No work at import time.** Modules define things; entrypoints do things, behind an
  `import.meta.main` guard. `tests/unit/coverageSurface.test.ts` imports every source
  module, so a top-level side effect would run during the test suite.
- **No type assertions** except the single commented `AbsPath` brand in
  `core/paths.ts`.
- **No module mocking** (anti-slop `no-module-mocking`). Inject a fake from
  `tests/helpers/fakes/`.
- Comment density matches the Python being replaced: explain *why* a quirk exists,
  never restate the code.

## Testing

- `bun:test`. Table-driven for pure functions: an array of
  `{ name, input, expected }`.
- **Never fake the `Db` port** — FTS5's stemmer, bm25 weighting and `NEAR` semantics
  *are* the behavior under test. Use a real `bun:sqlite` `:memory:` database.
- Build containers via `tests/helpers/container.ts`.
- A test that pins a Python quirk names the source line in a comment.
- Layout is **test level first, then module**, mirroring `src/`:
  `tests/unit/<module>` (pure) · `tests/integration/<module>` (real temp dirs and a
  real SQLite) · `tests/contract/session` (the hook protocol) · `tests/cli` (spawned
  e2e) · `tests/parity` (differential vs Python, deleted at cutover) · `tests/golden`
  · `tests/fixtures` · `tests/helpers`.
- Anything that spawns the built CLI must call `ensureDistBuilt()` from
  `tests/helpers/build.ts` in its own `beforeAll` — bun test gives no cross-file
  ordering guarantee, and relying on a stale `dist/` passes locally and fails in CI.

## Never let a test touch the real machine

This project installs itself into `~/.claude/settings.json`, `~/.local/bin/memory` and
a launchd job, on a machine where cc-memory is live and in use. A test that reaches the
real HOME does not just fail — it can silently break the user's editor. This has
happened once already; both root causes are non-obvious and worth knowing:

- **`process.env.HOME` does NOT change what in-process code sees as home.** Bun's
  `os.homedir()` reads the value captured at startup, so mutating `process.env.HOME`
  mid-test isolates *nothing*. It works only for a genuinely separate **spawned**
  process. To isolate in-process code, inject a fake `Env`/`FileSystem` through the
  container — never by setting an environment variable.
- **`dispatch()` in `cli/main.ts` calls `install(parsed)`/`uninstall()` with no
  container**, so those two build a REAL one. Calling them in-process from a test hits
  the real filesystem and the real `launchctl`. Pass an explicit fake container, or use
  `--dry-run`, which by construction writes nothing.

Related trap in the same family: `Stdio`'s real adapter calls `process.exit()`. Any
command invoked in-process with a real container can therefore **terminate the whole
`bun test` run mid-way, with exit code 0 and no output** — a green-looking suite that
never ran its remaining files. If a test needs a real `process.exit`, spawn a
subprocess. This is precisely why the `Stdio` port exists.

## Toolchain

```sh
bun install
bun run check        # fmt:check + lint + typecheck + test --coverage
bun run fmt          # oxfmt, write
bun run lint         # oxlint + the vendored anti-slop plugin (15 rules)
bun run typecheck    # tsc --noEmit — oxlint is syntactic, this is the type gate
bun test             # fast, no coverage
bun run test:parity  # differential harness vs the Python implementation
```

`oxlint` and `oxfmt` are always invoked **through `bun`**
(`bun ./node_modules/.bin/oxlint`). Run via `npx`/plain `node` they fail with
`Unknown file extension ".ts"`, because their TS-config loader needs Node ≥ 22.18 and
the default `node` here is v20. Do not "fix" this by pinning a Node version — Bun is
the runtime for this project.

A `PostToolUse` hook (`tools/dev/checkFile.sh`) formats and lints every `.ts` file on
write and feeds lint findings straight back. Fix them immediately.

## Definition of done (every packet)

```sh
bun run check          # green
bun run test:parity    # green, or a registered divergence
```

A behavior change from the Python needs an entry in `tests/parity/divergences.ts`
with `{ case, reason, bugfix }` referencing the plan's bug-fix row. Never silently
loosen an assertion.
