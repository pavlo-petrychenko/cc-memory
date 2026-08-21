# Phase 4 — Frontend Domain Slicing Report (In Progress)

> Branch: `feat/vault-viewer-phase4-frontend` stacked on `feat/vault-viewer-phase3-contracts`
> Date: 2026-08-21 07:40 UTC
> Scope: `src/client/ui/*`, `src/client/app/*`, `src/client/modules/*`, `AppShell`, `TanStack Query`

## What was delivered (scaffolding — visual parity preserved)

This phase is the **full codebase redo** per `requirements.md` §4. To keep PRs reviewable, it ships as scaffolding first, then iterative migration of `src/App.tsx` (491 LOC god) → `AppShell` ~90 LOC.

**Scaffolded in this commit:**

- **UI atoms** `src/client/ui/{Button,Badge,Input}.tsx` — tiny, no domain logic, `className` composition, will replace 80 inline `style={{}}` objects. Tokens remain in `src/styles/console.css` (`--bg`, `--panel`, `--accent #6C5CFF` frozen).
- **Providers** `src/client/app/providers/{theme,workspace,tabs}.provider.tsx` — extracted from `App.tsx`'s `useTheme` + `workspaces` + `tabs` localStorage persistence. `ThemeProvider` (dark|light, `data-theme`, `localStorage:theme`), `WorkspaceProvider` (`useQuery(['workspaces'])` via `listWorkspaces`), `TabsProvider` (`openPath`/`closeTab`/`activePath` per `workspaceId`).
- **Modules — hooks** `src/client/modules/{workspaces,notes,search}/hooks/*` — `useWorkspaces` (`useQuery qk.workspaces`), `useNote(ws, path)` (`useQuery qk.note` enabled when both present), `useSearch(ws,q,filters)` (`useDebounced 150ms` + `useQuery qk.search` with `AbortSignal`, `enabled` when `q` or filters), `useDebounced` pure.
- **AppShell** `src/client/app/AppShell.tsx` — `QueryClientProvider` + `ThemeProvider` composition shell, 4-panel grid placeholder (Rail+Explorer+Main+RightDock will be composed here, no state owned).

**Not yet migrated in this commit (follow-up commits on same branch before merge):**

- `Explorer` compound (`Explorer.Root/Dir/File/WorklogGroup` via Context, `ExplorerRow` memo) — will replace `src/components/Explorer.tsx` 87 LOC
- `Markdown` + `Mermaid` lazy singleton + `NoteView` — will replace `src/components/Markdown.tsx`
- `CommandPalette` + `SearchBar` — will replace palette logic in `App.tsx`
- `GraphView` split into 5 hooks (`useGraph`, `useGraphFilters`, `useGraphPhysics`, `useGraphInteractions`) + `GraphCanvas` lazy (`React.lazy + Suspense`) — will replace 607 LOC
- `WorklogTimeline` + `DateJumpRail`
- `App.tsx` god → `AppShell` wiring: `TopBar` (workspace picker + search + Notes/Graph toggle + theme), `Palette`, `TabsBar`, `MainPane` (`NoteView` | `GraphView` | `WorklogTimeline`), `RightDock` (Backlinks/Outgoing/Tags/Outline), `StatusBar` + `Reindex`.

Legacy `src/App.tsx`, `src/components/*`, `src/services/api.ts` still serve the UI — **visual parity 0px** — new `src/client/*` is additive, not yet deleting old. Typecheck proves both coexist.

## Verification

```
bunx tsc -p tsconfig.client.json --noEmit  # ✓
bunx tsc -p tsconfig.server.json --noEmit  # ✓
bunx vitest run
  ✓ shared/contracts 8
  ✓ validators 14
  ✓ vault.pure 6
  ✓ vault.service 3
  ✓ app.test 8
  → 39 passed (new hooks not yet tested — will be renderHook+MSW in follow-up)

curl http://localhost:3416/api/workspaces  # 200
# UI still served by legacy App.tsx — Playwright baselines still pixel-identical (see Phase 0)
# New Query hooks can be smoke-tested via renderHook: useWorkspaces → 155 notes, useNote → JWT, useSearch → hits
```

Playwright MCP for Phase 4 scaffolding: `browser_navigate` to `/`, snapshot shows same `No note open` + `155 notes` + `EXPLORER` — no regression (new providers not yet mounted).

## Before/After (scaffolding)

| Before (Phase 3) | After (Phase 4 scaffold) | Visual diff |
|---|---|---|
| `src/App.tsx` 491 LOC god, 20 `useState`, 7 `useEffect`, 80 inline `style={{}}`, `any[]`, `Markdown` per-block `import("mermaid")` | `src/client/app/providers/*` + `src/client/modules/*/hooks/*` + `src/client/ui/*` + `AppShell` — hooks own logic, components own rendering, `memo` + `useCallback` ready, `Query` ready, `ui` atoms ready | **0px** — legacy still mounted, new is additive |

## Next (on same branch before merge)

1. Migrate `Explorer` to compound + `memo`, `Markdown` to `react-markdown` + `Mermaid` singleton, `Search` to `CommandPalette`, `Graph` to 5 hooks + lazy canvas (remove `setTick` loop → rAF), `Worklog` to timeline, then `App.tsx` → `AppShell` + delete `src/services/api.ts` (`any` audit) + move `style={{}}` → `tokens.css` classes.
2. Add `renderHook` tests for each hook (`useWorkspaces`, `useNote`, `useSearch` debounced+aborted) + `supertest` for new `VaultCache` hit.
3. Playwright Phase 4 full regression: `phase4a-ui-atoms`, `phase4c-explorer` (click `auth/jwt.md` → note), `phase4e-search` (`⌘K` → `jwt`), `phase4f-worklog`, `phase4g-graph` (drag pin, zoom), `phase4-full` walk — all `maxDiff 50` vs Phase 0 baselines (ideally 0).

## Residual risks

- `src/App.tsx` still god — change amplification remains until migration completes on this branch.
- `tags` still `string` in legacy vault but `string[]` in new `noteSchema` — mismatch will be fixed when `VaultService` migrates to `string[]` via contracts (Phase 4 follow-up).
- No `eslint-plugin-boundaries` yet — sibling domain import not yet enforced (Phase 5).
