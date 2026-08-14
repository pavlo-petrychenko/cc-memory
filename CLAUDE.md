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

## Architecture and layering

```
entrypoints   src/cli/  src/hooks/      thin: parse, dispatch, render. no logic.
services      src/services/             orchestration; all I/O through ports
ports         src/ports/                interfaces only
adapters      src/adapters/             thinnest possible real implementations
domain        src/domain/               pure functions — the bulk of the code and tests
```

**Layering rule, enforced by a test:** nothing under `src/domain/` may import
`node:*`, `bun:*`, `../ports` or `../adapters`. Dates, times, paths and file contents
arrive as parameters. If a domain function needs I/O, it belongs in a service.

Two consequences worth internalizing:

- **Ranking is pure.** `domain/rank.ts` receives already-fetched hit arrays and
  returns fused hits. No SQL. That's what makes retrieval testable.
- **Every agent-visible byte comes from a pure renderer** in `src/domain/render/`, so
  contract tests are exact string assertions rather than end-to-end guesswork.

## File naming

Not Python style — no `kebab-case.ts`.

| Kind | Convention | Examples |
|---|---|---|
| Types / enums / models | `PascalCase.ts` | `Workspace.ts`, `HookResult.ts`, `Config.ts`, `Result.ts` |
| Role-bearing modules | `camelCase.<role>.ts` | `registry.service.ts`, `fileSystem.port.ts`, `fsReal.adapter.ts`, `kbMap.renderer.ts`, `sessionStart.hook.ts`, `search.command.ts` |
| Pure utility modules | `camelCase.ts` | `tokenize.ts`, `paths.ts`, `query.ts`, `rank.ts` |
| Tests | mirror the subject | `tokenize.test.ts`, `registry.service.test.ts` |

Roles in use: `.port`, `.adapter`, `.service`, `.renderer`, `.hook`, `.command`,
`.fake`.

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
  `domain/paths.ts`.
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
- Layout: `tests/unit` (domain) · `tests/integration` (services) · `tests/contract`
  (hooks) · `tests/cli` (spawned e2e) · `tests/parity` (differential, temporary) ·
  `tests/golden` · `tests/fixtures` · `tests/helpers`.

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
