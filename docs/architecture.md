# Architecture reference

Detail that supports the root `CLAUDE.md` working agreement but is too long-form to
keep there: the module anatomy, the file-kind taxonomy, dependency direction, class
conventions, and the purity essay behind the root file's one-line summary.

## Module anatomy

Every module **and submodule** has exactly this shape:

```
<name>/
  index.ts               the public API — re-exports ONLY, no logic (top-level modules only)
  CLAUDE.md               what this is for, what it owns (top-level modules only)
  <name>.typedefs.ts     types and enums          (if it has any)
  <name>.constants.ts    frozen values             (if it has any)
  <name>.<role>.ts       AT MOST ONE implementation per role
  <name>.<role>.test.ts  its test, beside it
```

A second implementation of the same role does not become a sibling — it becomes a
folder: `services/<name>/`, `commands/<name>/`, `hooks/<name>/`, `formatters/<name>/`,
each repeating this shape. **Folder name equals file prefix**: `worklogFormat/` contains
`worklogFormat.*`, never `format/` containing `worklogFormat.*`.

`index.ts` exists only at each top-level module (`src/<module>/index.ts`) and contains
re-exports and nothing else; no directory below that owns one. Reaching past a module's
`index.ts` into its internals is a violation. Importing a `*.typedefs.ts` or
`*.constants.ts` directly across modules is fine; they are declarations and cannot
cycle. `src/quality/moduleBoundaries.test.ts` and `fileKinds.test.ts` enforce this.

`testing/` is the one directory with no barrel, because a test names the single fake or
fixture it needs and a barrel there would pull every fake — and every adapter behind
them — into any file touching one.

## Dependency direction

Every module may use `core/`. Only role-suffixed files may use `platform/`. `cli/` may
use every module; no module may import `cli` at runtime, and no two modules may import
each other. A cycle means they are really one module wearing two names.

## Imports

**Absolute, always** — `@/session/session.typedefs.ts`, never `../../../session/…`. A
file's imports then read the same wherever it sits, and moving a file no longer rewrites
its import block.

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

A file is pure when it imports nothing from `platform/` and no `node:`/`bun:` builtin;
reads no ambient state (`process.env`, `Date.now()`, `Math.random()`, `cwd`, filesystem,
network); every input arrives as a parameter; and the same arguments always produce the
same result. Impure suffixes are exactly `.service`, `.adapter`, `.command`, `.hook`,
`.container`; `cli/main.ts` is the single exception, as the composition root. Purity is
why most of the suite needs no fakes, no temp dirs and no clock — protect it.
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

- **No magic strings — use enums.** Any string that is really a closed set of cases gets
  a TypeScript `enum` (wire formats get an enum whose values are the exact protocol
  strings). Never compare against a bare literal.
- **Readable names, always.** No one-letter variables, no vague generics (`data`, `info`,
  `res`, `tmp`, `handle`, `doStuff`).
- **No nested or clever ternaries.** One level, both branches trivial, or use `if`.
- **Errors are returned, not thrown, across module boundaries** — a `Result<T, E>` with a
  typed error union per boundary. Throwing is for genuinely unreachable states.
- **Parse untrusted input at the boundary into a named type.** No `unknown`/`any` in a
  signature, no `Record<string, unknown>` bags passed around.
- `readonly` on type fields and arrays; `type` over `interface`; named exports only; one
  concern per file.
- **No work at import time.** Modules define things; entrypoints do things, behind an
  `import.meta.main` guard.
- **No type assertions** except the branded `AbsPath` cast in `core/utils/paths` and the
  `Sqlite` adapter's row cast — every assertion needs a `// SAFETY:` comment stating the
  invariant that makes it sound.
- **No module mocking.** Inject a fake from `src/testing/fakes/`.

## Testing

- `bun:test`. Table-driven for pure functions: an array of `{ name, input, expected }`.
- **Tests live beside the code they cover**, one per implementation file.
  `src/quality/testPresence.test.ts` enforces this, with a short list of named exceptions
  for files genuinely covered through their only caller.
- Shared machinery lives in `src/testing/`: the port `fakes/`, the vault/container
  `fixtures/`, `utils/` (temp dirs, building `dist`, spawning the CLI) and the committed
  CLI `golden/` files.
- Anything that spawns the built CLI must call `ensureDistBuilt()` in its own `beforeAll`
  — bun test gives no cross-file ordering guarantee, so a stale `dist/` passes locally
  and fails in CI.
- **Coverage is a report, not the guarantee.** It cannot catch a module with no tests at
  all, because Bun only instruments files some test imports — that is what
  `testPresence` is for.

## Comments

A comment describes **the code**: what it does when the name isn't enough, or why a
non-obvious choice holds. Nothing else belongs in one.

Never commit a comment mentioning: a plan, work packet, numbered bug-fix list, or
contract identifier; a file, line or symbol that no longer exists; how the code was
produced or checked ("verified by diffing", "the reviewer asked for"); or migration/task
status ("for now", "until X lands", "temporary"). If a comment only makes sense to
someone who was in the room, delete it.

When a citation would explain a real constraint, restate the constraint as a fact about
the code instead of citing its origin:

```ts
// bad  — cites a file being deleted, and a contract only we know about
/** Serializes the registry (C1) — a port of lib/registry.py:60-85. */

// good — the reader learns the actual requirement
/** Emits arrays without spaces inside the brackets: this file is rewritten in place by
 *  `memory workspace add|rm`, so its formatting must stay stable or every write shows up
 *  as spurious churn in the user's registry. */
```

Prefer deleting over rewriting — a redundant comment rots and lies. Always keep
`// SAFETY:` comments justifying a type assertion, and warnings about real runtime or
dependency traps (see the root `CLAUDE.md`'s **Traps** section).
