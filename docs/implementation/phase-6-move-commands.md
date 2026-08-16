# Phase 6: Move CLI Commands to Module Resolvers

## Dependencies

- Phase 4 (decorators), Phase 5 (services + `UseCase` subclasses)

## Can Parallel With

- Phase 7 (hooks) only in file-disjointness; land one first — both rewrite wiring
  imports.

## Objective

Move `search`/`reindex`/`help`/`version` out of `src/cli/commands/` into their
domain modules, and convert **every** command to a thin `@Command` resolver living
in `resolvers/commands/`. Resolvers hold no logic: they carry `Handler` (the use
case), `mapOptions` (parse), and `PostProcessing` (a formatter).

## Command → resolver map (14 commands)

| Command | Resolver file | Handler | PostProcessing |
|---|---|---|---|
| `workspace add` | `workspace/resolvers/commands/workspaceAdd.command.ts` | `AddWorkspaceUseCase` | `WorkspaceAddFormatter` |
| `workspace rm` | `workspace/resolvers/commands/workspaceRm.command.ts` | `RemoveWorkspaceUseCase` | `WorkspaceRmFormatter` |
| `workspace ls` | `workspace/resolvers/commands/workspaceLs.command.ts` | `ListWorkspacesUseCase` | `WorkspaceLsFormatter` |
| `resolve` | `workspace/resolvers/commands/resolve.command.ts` | `ResolveWorkspaceUseCase` | `ResolveFormatter` |
| `reindex` | `memory/resolvers/commands/reindexMemory.command.ts` (move) | `ReindexMemoryUseCase` | `ReindexFormatter` |
| `search` | `memory/resolvers/commands/searchMemory.command.ts` (move) | `SearchMemoryUseCase` | `SearchHitFormatter` |
| `notes` | `note/resolvers/commands/notes.command.ts` | `ListNotesUseCase` | `NotesFormatter` |
| `commit` | `worklog/resolvers/commands/commit.command.ts` | `CommitWorklogUseCase` | `CommitFormatter` |
| `doctor` | `installation/resolvers/commands/doctor.command.ts` | `DoctorUseCase` | `DoctorFormatter` |
| `install` | `installation/resolvers/commands/install.command.ts` | `InstallUseCase` | — |
| `uninstall` | `installation/resolvers/commands/uninstall.command.ts` | `UninstallUseCase` | — |
| `help` | `meta/resolvers/commands/help.command.ts` (move) | — (no use case) | `HelpFormatter` |
| `version` | `meta/resolvers/commands/version.command.ts` (move) | — (no use case) | — |
| `hook` | deleted in Phase 8 (moves to `main.ts` dispatch) | — | — |

`help`/`version` are **pure utility** — no use case. `help` formats
`COMMAND_DESCRIPTORS` via `HelpFormatter`; `version` reads the `src/version.ts`
constant. They are the only `@Command` resolvers without a `Handler`.

## Resolver shape (thin)

```typescript
import { Command } from "@/core/index.ts";

@Command({
  path: ["search"],
  usage: ["search <query>"],
  summary: "search notes and worklogs",
  hidden: false,
  Handler: SearchMemoryUseCase,
  mapOptions: (tokens) => parseSearch(tokens),   // Result<SearchInput, ArgsError> — moved parse()
  PostProcessing: SearchHitFormatter,
})
export class SearchMemoryCommand {}
```

The `parse`/`run` logic from today's command classes is **split**: parsing →
`mapOptions`, orchestration → the use case's `execute`, rendering → the formatter.
Nothing stays in the resolver.

## Move the four `cli/commands/` trees

- `cli/commands/search/*` → `memory/resolvers/commands/searchMemory.command.ts`
  (+ moved `.test.ts`, `.constants.ts`)
- `cli/commands/reindex/*` → `memory/resolvers/commands/reindexMemory.command.ts`
  (+ `reindex.formatter.ts` → `memory/formatters/reindex.formatter.ts`)
- `cli/commands/help/*` → `meta/resolvers/commands/help.command.ts`
  (+ `help.formatter.ts` → `meta/formatters/help.formatter.ts`, constants/typedefs)
- `cli/commands/version/*` → `meta/resolvers/commands/version.command.ts`

`note/commands/notes.command.ts`, `worklog/commands/commit/commit.command.ts`,
`workspace/commands/*/`, `installation/commands/*/` move to their module's
`resolvers/commands/` (flat filenames, no per-command subdirectories), and their
`commands/` directories are removed.

## Tests

- Move each command's `.command.test.ts` beside its new resolver file; update
  imports. `--help`, `search`, `reindex` goldens stay byte-identical.

## Acceptance Criteria

- [ ] `resolvers/commands/` exists in workspace, note, worklog, memory,
  installation, meta; old `commands/` dirs removed
- [ ] Every `.command.ts` carries `@Command` (kept true for `registries.test.ts`)
- [ ] Every `@Command` has `usage`/`summary`/`hidden` and a `mapOptions` returning
  `Result<Options, ArgsError>` (parse errors still exit 2)
- [ ] `help`/`version` have no `Handler` (no use case)
- [ ] `bun run check` passes from a clean `dist/`

## Next Phase

→ Phase 7 (split hooks to module resolvers).
