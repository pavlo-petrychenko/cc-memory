# cc-memory — working agreement

Persistent, layered, per-workspace memory for Claude Code: markdown vaults as the
source of truth, a derived SQLite FTS5 index, five Claude Code hooks and six skills.
Entirely session-driven — there is no background process.

**Right now this repo is mid-migration.** The original Python PoC is being rewritten in
TypeScript on Bun with the whole surface under test. It lands in two branches:
`ts-migration` adds the TypeScript implementation alongside the still-installed Python,
and `ts-cutover` deletes the Python and switches the install over. Until that second
branch merges, the Python in `src/lib/`, `src/bin/` and `src/hooks/` is the
implementation actually running on this machine — it is read-only reference, never a
place to make a change.

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
| C4 | Vault file formats: `STATE.md` and `<date>.md` journal entries |
| C5 | `CCMEM_*` env var names and defaults |
| C6 | Installed surface: `~/.local/bin/memory`, index location |
| C7 | Retrieval semantics: `porter unicode61`, bm25 weights 10/1/5 and 3/1/1, RRF k=60, compound-split tokens |

`index.db`'s schema is explicitly **not** frozen — bump `SCHEMA_VERSION` and it
rebuilds itself.

## Porting discipline

- **Port, don't reinvent.** Translate the Python and keep its behavior, quirks included.
  Reproduce an odd behavior and pin it with a test rather than quietly improving it —
  the skills and every existing vault already depend on it.
- **Never re-derive a constant.** Copy every number, regex, SQL string, bm25 weight,
  threshold and template from the Python rather than reconstructing it from intent. A
  re-derived value looks right and silently changes retrieval.
- **Agent-visible text is a contract.** Injected context, nudges and CLI output are
  copied character for character.
- **The dependency list is closed**: `smol-toml`, `yaml`, `bun:sqlite`, plus dev
  tooling. Adding a dependency needs a conversation.
- **Never edit `*.py`**, and never touch `src/skills/` except in the cutover.
- **The migration adds no features.** A missing capability is a backlog item, not
  something to slip in while the file is open.

## Architecture — modules, not layers

The top level of `src/` is the list of things this project *is*. Everything one feature
needs lives in one directory: its types, its constants, its logic, its formatters, its
CLI command, and its tests.

```
src/
  core/        shared kernel: Result, AbsPath, Workspace, Config, the CLI outcome
               vocabulary, and dependency-free path/slug utils. Depends on nothing.
  platform/    the ONLY place that touches the outside world. One folder per port:
               fileSystem, git, proc, db, logger, clock, env, stdio, container.
  workspace/   the registry, cwd→workspace resolution, worktree slugs, target resolution
  retrieval/   tokenizing, query building, ranking, the SQLite index, search
  knowledge/   vault notes: frontmatter/wikilink parsing, and the KB map
  worklog/     STATE.md + the dated journal
  install/     wiring into Claude Code, and doctor (which diagnoses an install)
  session/     the five Claude Code hooks and their shared fail-open runtime
  cli/         the composition shell: arg parsing, dispatch, output
  testing/     fakes, fixtures, goldens and helpers — imported only by tests
  quality/     tests that assert on the repo's own shape, not on any one file
```

### Module anatomy

Every module **and submodule** has exactly this shape:

```
<name>/
  index.ts               the public API — re-exports ONLY, no logic
  CLAUDE.md              ≤20 lines: what this is for, what it owns
  <name>.typedefs.ts     types and enums          (if it has any)
  <name>.constants.ts    frozen values            (if it has any)
  <name>.<role>.ts       AT MOST ONE implementation per role
  <name>.<role>.test.ts  its test, beside it
```

A second implementation of the same role does not become a sibling — it becomes a
folder: `services/<name>/`, `commands/<name>/`, `hooks/<name>/`, `formatters/<name>/`,
each repeating this shape. **Folder name equals file prefix**: `worklogFormat/` contains
`worklogFormat.*`, never `format/` containing `worklogFormat.*`.

`index.ts` contains re-exports and nothing else. Reaching past a module's `index.ts`
into its internals is a violation — that is what lets an implementation change behind
its contract. Importing a `*.typedefs.ts` or `*.constants.ts` directly across modules is
fine; they are declarations and cannot cycle.
`src/quality/moduleBoundaries.test.ts` enforces both rules.

`testing/` is the one directory with no barrel, because a test names the single fake or
fixture it needs and a barrel there would pull every fake — and every adapter behind
them — into any file touching one.

### Dependency direction

Every module may use `core/`. Only role-suffixed files may use `platform/`. `cli/` may
use every module; **no module may import `cli` at runtime**, and no two modules may
import each other. A cycle means they are really one module wearing two names.

Two traps worth knowing, both of which have bitten this codebase:

- **Barrels create runtime cycles.** Importing an enum through an `index.ts` that also
  re-exports implementation can leave it uninitialised at module-evaluation time.
- **`import { type X }` is not `import type { X }`.** Under `verbatimModuleSyntax` the
  first still emits a runtime import. Use the second for type-only dependencies.

## Imports

**Absolute, always** — `@/session/session.typedefs.ts`, never `../../../session/…`. A
file's imports then read the same wherever it sits, and moving a file no longer rewrites
its import block. (TypeScript 7 removed `baseUrl`; `paths` in tsconfig.json resolves
relative to that file.)

## File kinds

The suffix tells you what is inside a file, and whether it can touch the outside world,
before you open it. `src/quality/fileKinds.test.ts` enforces this.

| Suffix | Contains | Class? | Pure? |
|---|---|---|---|
| `.typedefs.ts` | types, interfaces, enums | — | yes |
| `.constants.ts` | frozen values | — | yes |
| `.service.ts` | orchestration; may use ports | class | no |
| `.adapter.ts` | a real implementation of a port | class | no |
| `.command.ts` | one CLI subcommand | class | no |
| `.hook.ts` | one Claude Code hook handler | class | no |
| `.container.ts` | the composition root | class | no |
| `.parser.ts` | untrusted input → a typed value | class | yes |
| `.serializer.ts` | data → output a **program** re-parses | class | yes |
| `.formatter.ts` | data → text a **human or the agent** reads | class | yes |
| `.builder.ts` | data → a query/expression string | class | yes |
| `.ranker.ts` | scoring and ordering | class | yes |
| `.utils.ts` | small stateless helpers, no domain knowledge | functions | yes |
| `.fake.ts`, `.fixture.ts` | test doubles and builders (`testing/` only) | either | — |

Enums live in `.typedefs.ts`: an enum *is* the type it constrains.

**No magic values.** Every module-scope constant goes in `*.constants.ts`, including
values used exactly once — thresholds, filenames, timeouts, regexes, SQL, messages,
defaults. Only trivially obvious indices (`0`, `1`, `-1`) and the empty string stay
inline.

## Purity

A file is **pure** when: it imports nothing from `platform/` and no `node:`/`bun:`
builtin; it reads no ambient state (no `process.env`, `Date.now()`, `Math.random()`,
`cwd`, filesystem, network); every input arrives as a parameter and the only effect is
the return value; and the same arguments always produce the same result.

Impure suffixes are exactly `.service`, `.adapter`, `.command`, `.hook`, `.container`;
`cli/main.ts` is the single exception, as the composition root. Purity is why most of
the suite needs no fakes, no temp dirs and no clock — protect it.
`src/quality/purity.test.ts` enforces it.

## Classes

Every role except `.utils.ts` is a class with **constructor-injected** dependencies.

```ts
export class RegistryService {
  constructor(private readonly fs: FileSystem) {}
  async load(path: AbsPath): Promise<Result<readonly RawWorkspace[], RegistryError>> { … }
}
```

- Class name matches the file: `registry.service.ts` exports `RegistryService`.
- Methods drop the redundant prefix: `RegistryService.load`, not `loadRegistry`.
- Dependencies are **port interfaces**, never concrete adapters, so a test passes a fake
  without touching the module.
- No service reaches for the container, no singletons, no static state, no top-level
  instances. `implements` an interface; never `extends` another service — shared
  behavior goes in an injected collaborator.

## Utilities

- `core/utils/` — cross-module helpers with **no domain knowledge** (paths, slugs). If it
  mentions a workspace, a note or a hook, it does not belong here.
- `<module>/utils/<name>/` — helpers used by 2+ files inside one module. Used by exactly
  one file? Keep it private to that file.

A `.utils.ts` may not import another module.

## Code style

- **No magic strings — use enums.** Any string that is really a closed set of cases
  gets a TypeScript `enum` (for wire formats, an enum whose values are the exact
  protocol strings). Never compare against a bare literal. Other constants go in a
  `*.constants.ts` — see **§ File kinds**.

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
  `import.meta.main` guard. A top-level side effect runs the moment any test imports
  the module.
- **No type assertions** except the commented `AbsPath` brand in `core/utils/paths`.
  Every assertion elsewhere needs a `// SAFETY:` comment stating the invariant that
  makes it sound (the linter requires one).
- **No module mocking** (anti-slop `no-module-mocking`). Inject a fake from
  `src/testing/fakes/`.
- Comments follow the rules in **§ Comments** below.

## Comments

A comment describes **the code**: what it does when the name isn't enough, or why a
non-obvious choice holds. Nothing else belongs in one.

**Never reference local development context.** A comment is read by someone looking at
the finished code, who has no idea what our plan documents, branches, packets or
review conversations were. Specifically, never commit a comment that mentions:

- a plan, a work packet, a numbered bug-fix list, or a contract identifier
- a file, line number or symbol that no longer exists (or is about to be deleted)
- how the code was produced or checked — "verified by diffing", "CI caught this",
  "the reviewer asked for", "written in parallel by", "found during review"
- migration or task status — "for now", "until X lands", "temporary", "revisit later"

If a comment only makes sense to someone who was in the room, delete it.

**Keep the substance, drop the provenance.** When a citation explains a real
constraint, restate the constraint as a fact about this code:

```ts
// bad  — cites a file being deleted, and a contract only we know about
/** Serializes the registry (C1) — a port of lib/registry.py:60-85. Python's `_arr`
 *  emits no inner spaces, and C1 requires byte-identical output. */

// good — the reader learns the actual requirement
/** Emits arrays without spaces inside the brackets. This file is user-owned and
 *  rewritten in place by `memory workspace add|rm`, so its formatting has to stay
 *  stable or every write shows up as spurious churn in the user's registry. */
```

**Prefer deleting over rewriting.** A redundant comment is worse than none — it rots
and it lies. But don't strip genuinely subtle logic down to zero explanation.

**Always keep**: `// SAFETY:` comments justifying a type assertion (the linter requires
them — state the invariant that makes the assertion sound), and warnings about real
runtime or dependency traps, which save the next person hours.

## Testing

- `bun:test`. Table-driven for pure functions: an array of
  `{ name, input, expected }`.
- **Never fake the `Db` port** — FTS5's stemmer, bm25 weighting and `NEAR` semantics
  *are* the behavior under test. Use a real `bun:sqlite` `:memory:` database.
- **Tests live beside the code they cover**, one per implementation file:
  `retrieval/query/tokenizer/tokenizer.parser.test.ts` sits next to
  `tokenizer.parser.ts`. `src/quality/testPresence.test.ts` enforces this, with a short
  list of named exceptions for files genuinely covered through their only caller.
- Shared machinery lives in `src/testing/`: the port `fakes/`, the vault/container
  `fixtures/`, `utils/` (temp dirs, building `dist`, spawning the CLI) and the
  committed CLI `golden/` files. Build containers via `testing/fixtures`.
- Anything that spawns the built CLI must call `ensureDistBuilt()` in its own
  `beforeAll` — bun test gives no cross-file ordering guarantee, and relying on a
  stale `dist/` passes locally and fails in CI.
- **Coverage is a report, not the guarantee.** The threshold is a low line-coverage
  floor; it cannot catch a module with no tests at all, because Bun only instruments
  files that some test imports. That is what `testPresence` is for. Never add code to
  move a coverage number — that is how empty constructors and tests-for-mocks get in.

## Never let a test touch the real machine

This project installs itself into `~/.claude/settings.json`, `~/.local/bin/memory` and
`~/.claude/memory/`, on a machine where cc-memory is live and in daily use. A test that
reaches the real HOME does not just fail — it can silently break the user's editor. That
has happened once already, and both root causes are non-obvious:

- **`process.env.HOME` does NOT change what in-process code sees as home.** Bun's
  `os.homedir()` reads the value captured at startup, so mutating `process.env.HOME`
  mid-test isolates *nothing*. It works only for a genuinely separate **spawned**
  process. To isolate in-process code, inject a fake `Env`/`FileSystem` through the
  container — never by setting an environment variable.
- **`dispatch()` in `cli/main.ts` calls `install(parsed)`/`uninstall()` with no
  container**, so those two build a REAL one. Calling them in-process from a test hits
  the real filesystem. Pass an explicit fake container, or use
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
bun run build        # bundle to dist/memory.js
```

`oxlint` and `oxfmt` are always invoked **through `bun`**
(`bun ./node_modules/.bin/oxlint`). Run via `npx`/plain `node` they fail with
`Unknown file extension ".ts"`, because their TS-config loader needs Node ≥ 22.18 and
the default `node` here is v20. Do not "fix" this by pinning a Node version — Bun is
the runtime for this project.

A `PostToolUse` hook (`tools/dev/checkFile.sh`) formats and lints every `.ts` file on
write and feeds lint findings straight back. Fix them immediately.

## Definition of done

```sh
bun run check    # format, lint, typecheck, the full suite, coverage
```

Run it from a clean `dist/` (`rm -rf dist`) — a stale build masks failures that CI
will hit.

Never loosen an assertion or lower a gate to go green. If a rule is wrong, change the
rule deliberately and say why; if a test is wrong, fix the code it is testing. The
structural tests in `src/quality/` exist to make that discipline mechanical:

| Test | Guarantees |
|---|---|
| `purity.test.ts` | pure files never reach `platform/`, node or bun |
| `moduleBoundaries.test.ts` | cross-module imports name an `index.ts`; only tests use `testing/`; no cycles between modules |
| `fileKinds.test.ts` | typedefs/constants hold no behavior; every file has a role suffix; every module has an `index.ts` |
| `testPresence.test.ts` | every implementation file has a test beside it |
