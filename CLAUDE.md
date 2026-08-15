# cc-memory — working agreement

Persistent, layered, per-workspace memory for Claude Code: markdown vaults as the
source of truth, a derived SQLite FTS5 index, five Claude Code hooks and five skills.
Entirely session-driven — there is no background process.

It began as a Python proof of concept and was rewritten in TypeScript on Bun with the
whole surface under test. The Python is gone; nothing in the tree is a reference
implementation any more, so the tests are the only record of the behavior that
existing vaults and skills depend on. Treat them that way.

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

Changing any of these is a breaking change to a live install — someone's registry stops
parsing, a skill stops finding what it greps for, or a vault full of worklogs stops
matching the format that reads them. Each one has tests that pin it exactly; if a change
here is genuinely wanted, it is a deliberate migration, not an edit.

| | Contract |
|---|---|
| C1 | `~/.claude/memory/registry.toml` schema, `~` preserved on write |
| C2 | Hook stdin/stdout JSON per event; **always exit 0** |
| C3 | `memory` CLI surface and output shape — the skills parse it |
| C4 | Vault file formats: `STATE.md` and `<date>.md` journal entries |
| C5 | `CCMEM_*` env var names and defaults |
| C6 | Installed surface: `~/.local/bin/memory`, index location |
| C7 | Retrieval semantics: `porter unicode61`, bm25 weights 10/1/5 and 3/1/1, RRF k=60, compound-split tokens |

`index.db`'s schema is explicitly **not** frozen — bump `SCHEMA_VERSION` and it
rebuilds itself.

## Traps

Hard-won, non-obvious failure modes. Each cost real debugging time; don't rediscover them.

- **`process.env.HOME` does NOT change what `os.homedir()` returns in-process.** Bun
  reads `$HOME` once at startup, so mutating `process.env.HOME` mid-test isolates
  nothing. Only a genuinely **spawned** subprocess sees a new `$HOME`. To isolate
  in-process code, inject a fake `Env`/`FileSystem` through the container instead.
- **`Stdio`'s real adapter calls `process.exit()`.** A command run in-process with a
  real `Container` — `InstallCommand`, `UninstallCommand`, `HookDispatchCommand` all
  build one from the real `process.env` regardless of what container a test passes —
  can therefore terminate the whole `bun test` run mid-way, exit code 0, no output: a
  green-looking suite that never ran its remaining files. Construct the command with a
  fake container, use `--dry-run`, or spawn a subprocess if a real `process.exit` is
  actually needed.
- **FTS5 IDF collapse.** On a tiny corpus, a term present in most documents scores
  `-0.0` under `bm25()`, so the inject score floor rejects every hit. Expected FTS5
  behavior on small corpora, not a bug — don't "fix" it by loosening the floor.
- **Barrels create runtime cycles.** Importing an enum through an `index.ts` that also
  re-exports implementation can leave it uninitialised at module-evaluation time.
- **`import { type X }` is not `import type { X }`.** Under `verbatimModuleSyntax` the
  first still emits a runtime import; use the second for type-only dependencies.
- **`oxlint`/`oxfmt` must run through `bun`** (`bun ./node_modules/.bin/oxlint`). Via
  `npx`/plain `node` they fail with `Unknown file extension ".ts"` — their TS-config
  loader needs Node ≥ 22.18 and the default here is v20. Don't fix this by pinning a
  Node version; Bun is the runtime for this project.

This project installs itself into `~/.claude/settings.json`, `~/.local/bin/memory` and
`~/.claude/memory/` on a machine where cc-memory is live and in daily use — a test that
reaches the real `$HOME` doesn't just fail, it can break the user's real setup.

## Architecture — modules, not layers

The top level of `src/` is the list of things this project *is*. Everything one feature
needs lives in one directory: its types, its constants, its logic, its formatters, its
CLI command, and its tests. Module anatomy, file-kind suffixes, dependency direction and
class conventions live in [`docs/architecture.md`](docs/architecture.md); purity itself
is simply **no I/O and no ambient state**.

```
src/
  core/        shared kernel: Result, AbsPath, Workspace, Config, CLI outcomes, and
               dependency-free path/slug utils. Depends on nothing.
  platform/    the ONLY place touching the outside world — fileSystem, git, proc,
               sqlite, logger, clock, env, stdio, container.
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

## Discipline

- **Agent-visible text is a contract.** Injected context, hook nudges and CLI output are
  parsed by the skills — the golden files in `src/testing/golden/` exist so a string
  change is never accidental.
- **A tuning constant is not a free parameter.** Every threshold, bm25 weight, regex and
  timeout was chosen against real retrieval results — measure, don't reason about it.
- **The dependency list is closed**: `smol-toml`, `yaml`, `bun:sqlite`, plus dev tooling.
- **`src/skills/` is installed content, not source**, symlinked into `~/.claude/skills` —
  editing one changes the live install's behavior next session, with no build step and
  no test to catch it.
- **Comments describe the code, not its provenance.** No references to plans, packets,
  review conversations, or symbols that no longer exist. See `docs/architecture.md` for
  the full rule and the SAFETY-comment exception.

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
