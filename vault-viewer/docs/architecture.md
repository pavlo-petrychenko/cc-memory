# vault-viewer — Clean Architecture Plan

> Status: **design-only audit** — no code edited. This document is the synthesis of
> one independent deep audit plus 3 parallel `reviewer` agents (backend / full-stack / code-quality,
> `architecture-audit.md` 535 LOC, `backend-audit.md` 544 LOC, `code-quality-audit.md` 376 LOC;
> `frontend-audit` failed with 503 but is covered by the independent audit).  
> Each agent was instructed to read every file under `vault-viewer/server/**` and
> `vault-viewer/src/**` at `xhigh` depth and to argue its chosen architecture.

Source files audited:

```
server/index.ts  267 lines — 8 route handlers inline, no MVC
server/parser.ts 101 lines — pure, exported mutable regexes
server/registry.ts 78 lines — untyped env, no DI
server/vault.ts 177 lines — IO + pure mixed, N+1 stat, no cache
src/App.tsx      491 lines — god component, 20 useState, 7 useEffect
src/components/GraphView.tsx 607 lines — god file, D3 simulation + zoom/drag/config/render, setTick loop
src/components/Explorer.tsx  87 lines — recursive Row, stringly expanded Set
src/components/Markdown.tsx 120 lines — regex preprocess, per-block mermaid import
src/services/api.ts 37 lines — any[] everywhere
src/types.ts 57 lines — duplicate of server shapes
```

---

## 1. Executive summary

Vault-viewer ships as a competent prototype: Express on `:3416` + Vite/React on `:3415`
proxied via `/api`, fail-open, sandboxed `/api/file`, pure `parser.ts`.  
Its **repo structure** collapses every concern into one `package.json`, one `tsconfig`,
one `vite build`, and zero quality gates — the exact coupling that forces the parent
`cc-memory` repo to maintain `src/quality/*` tests. At ~1.2k LOC server + ~1.8k LOC
client it still builds, but any growth (auth, editing, SQLite index parity) will pay
exponential drift tax without shared contracts and module boundaries.

**Recommendation: Option B — `src/client + src/server + src/shared` monolith, single
`package.json`, two extending `tsconfig`s, typed Zod contracts, domain-vertical slices.**
Preserves `bun` as the single runtime (frozen per `CLAUDE.md` traps), adds ~12 lines
of JSON, and unlocks contracts + boundary enforcement without a `pnpm` migration.
If Lab/Obsidian become sibling viewers within 1–2 sprints, skip B and go straight to
C (pnpm workspaces) with `shared` at repo root.

All 3 agents + the independent audit converged on this choice for the same reasons.

---

## 2. What is wrong — severity table

### 2.1 Backend `server/`

| # | Severity | File:Line | Finding |
|---|----------|-----------|---------|
| **C-1** | Blocker | `server/index.ts:69`, `113` | Traversal check is `relPath.includes("..")` only. Misses `%2e%2e%2f`, `%252e`, absolute `/etc/passwd`, prefix bypass `startsWith(ws.kb)` matches `/vault` vs `/vault-evil` (no trailing `sep`). |
| **C-2** | Blocker | `server/index.ts:22` ×8 | No `asyncHandler` — a single `readdir` `EMFILE` or `parseToml` throw becomes unhandled rejection. Viewer claims fail-open but is fail-silent-crash. |
| **H-1** | High | `server/index.ts:1-267` | God file — 8 routes, cache, formatting, FS orchestration. |
| **H-2** | High | `server/index.ts:56,68,121,147,174,235,249` | Silent workspace fallback `find(...) ?? workspaces[0]` leaks data across workspaces when unknown ID is supplied (violates invariant #2). |
| **H-3** | High | `server/index.ts:142-145,172` | Query coercion via `String(req.query.q ?? "")`, `Number(depth)` → `NaN` → `for(d<NaN)` yields 0 hops silently, `full==="1"` ignores other truthy. |
| **H-4** | High | `server/index.ts:9` | `cors()` wide-open (`origin:*`), no `helmet`, no allowlist. |
| **H-5** | High | `server/index.ts:11`, `registry.ts:35` | Config not validated — `API_PORT=abc` → `Number("abc")=NaN` → `listen(NaN)` RangeError, `CCMEM_REGISTRY` unvalidated. |
| **M-1** | Medium | `server/index.ts:15-19,251` | `workspacesCache` global mutable, no TTL, race on concurrent load + `reindex` null. |
| **M-2** | Medium | `server/index.ts:119,152,179,251` | Inconsistent contracts: `/file` uses `.end()` vs JSON `{error}`, `/search` 200 `[]` on no workspace vs 404 elsewhere, `/reindex` fabricates `{added: notes.length}`. |
| **M-3** | Medium | `server/vault.ts:24-68,112-146` | Pure/effect mixed — `walkKb`/`scanWorklogs` interleave `readdir`/`stat`/`readFile` with sorting/filtering, no `FileSystem` port, untestable. |
| **M-4** | Medium | `server/vault.ts:40,148`, `server/index.ts:181-204` | Perf: serial `stat` per file, O(n×terms) search per request, `allEdges` rebuilt per graph request, no `ETag`/`Cache-Control`, no `compression`. |
| **L-1** | Low | `server/parser.ts:1,11` | `TYPED_RELATION` `/gm` exported mutable — `matchAll` resets `lastIndex` but a future `exec`/`test` call would poison it. |

### 2.2 Frontend `src/`

| # | Severity | File:Line | Finding |
|---|----------|-----------|---------|
| **Blocker** | `src/App.tsx:1-491` | God component: 20 states, 7 effects, search debounce, palette, tabs+localStorage, graph, worklog routing, toast, 80 inline `style={{}}` objects. No sub-component extraction. |
| **Blocker** | `src/components/GraphView.tsx:1-607` | God file: palette + Config + feature→color + `d3.forceSimulation` + 6 forces + zoom + drag + settings panel + SVG render. `setTick(t=>t+1)` on every D3 tick forces React re-render → double loop, object-identity deps recreate simulation endlessly. |
| **Critical** | `src/services/api.ts:3-17`, `src/App.tsx:18` | `any[]` erosion at boundary: `workspaces: any[]`, `kbTree: any`, `hits: any[]`, `graph: any`, `notesMeta: any[]`. `ParsedNote.tags: string` (space-joined) not `string[]`, forces `split(/\s+/)` everywhere, breaks `tag:auth/jwt`. |
| **Major** | `src/App.tsx:146-168`, `server/parser.ts:68-82`, `server/index.ts:88-104,171-188` | Wikilink resolution triplicated with divergent semantics (parser `typedTargets` vs graph `byRel/byTitleLower` vs `handleWikilink` hard-coded `auth/`, `search/` prefixes). Graph edges ≠ navigation. |
| **Major** | `server/vault.ts:128-155` vs client palette | Search scoring duplicated conceptually — server naive `includes` (title×10 tags×5 body×1 relPath×2) vs client display, no shared tokenizer/ranker, no contract test. |
| **Major** | `src/App.tsx:210+` | Inline styles recreated per render (~60×). Prevents `memo`, thrashes reconciliation, duplicates `console.css` tokens. |

### 2.3 Repo / Tooling

| # | File | Finding |
|---|------|---------|
| **F1** | `package.json:14-26` | Single package mixes server-only (`express`, `cors`, `chokidar`, `gray-matter`) and client-only (`d3`, `mermaid`, `react-markdown`) deps — stray `import "express"` in `src/` typechecks silently. |
| **F2** | `src/types.ts` vs `server/vault.ts`, `registry.ts` | No shared contract — `Workspace` (client 5 fields) vs server `Workspace` (7 fields `+exclude,indexDb,match`), `TreeNode` copy-pasted, `Note` shape ad-hoc per route. Drift is silent behind `any[]`. |
| **F3** | `tsconfig.json:13-17` | One `tsconfig` for both runtimes — `lib: ["ES2022","DOM"]`, `moduleResolution: bundler`, `jsx: react-jsx` applied to Node; `DOM` leaks `window` into server autocomplete. |
| **F5** | `vite.config.ts:8-11`, `package.json:6` | Dev via `concurrently` + Vite proxy hard-coded `http://localhost:3416` — breaks Docker/WSL, no `API_PORT` env propagation, orphan `bun --watch` on SIGINT. |
| **F9** | repo root | Zero quality gates — main repo has `oxlint` (15 rules), `oxfmt`, `purity.test.ts`, `moduleBoundaries.test.ts`, `fileKinds.test.ts`, `testPresence.test.ts`, `bun test --coverage`; viewer has none. |

---

## 3. Principles

### 3.1 Backend (nodejs-expert skill)

1. **MVC + Services.** `routes → validator(Zod) → controller → service → gateway`. Controllers are HTTP-only (status/headers/`res.json`), services are domain, testable without `req/res`.
2. **Middleware ordering is contract:** `helmet → cors(configured) → pinoHttp → routes → 404 → errorHandler`. Every async route wrapped by `asyncHandler`.
3. **Typed errors:** `AppError(status, code, isOperational)` hierarchy (`NotFoundError`, `ValidationError`, `ForbiddenError`). Client parses `{status,code,message,errors?}` reliably. Fail-open formalized via `errorHandler` + logging, not silent `catch{}`.
4. **Validation at boundary:** Zod schemas for every query/body, consumed by `validate(schema, where)` middleware — never manual `String(...)`.
5. **DI via constructor, not `homedir()` globals:** `FsGateway`, `RegistryLoader`, `VaultCache` injected — fakes swap in tests. Supertest without touching real `~`.
6. **Config object:** `config/env.ts` parses `process.env` once with Zod and throws on boot.

### 3.2 Frontend (react 2026 skills)

1. **Composition over boolean props** (`react-composition-2026`). Replace flag soup with Compound Components + Context (`Explorer.Root / Dir / File`).
2. **Hooks own logic, components own rendering** (`hooks-pattern`). Every `useEffect+fetch+useState` cluster becomes a `use*` hook with a single responsibility (`useWorkspaces`, `useVaultTree`, `useNote`, `useSearch`, `useGraph`, `useTabs`, `useTheme`, `useCommandPalette`). Components receive data+callbacks via props/context.
3. **TanStack Query for all server state** (`react-data-fetching`). Replaces raw fetch — gives dedup, cache, background refetch, `Suspense`, devtools, `prefetchQuery` on wikilink hover.
4. **Derive, don't store** (`render-optimization`). `hits` derives from `q+filters` via query key, not mirrored state.
5. **Small atomic UI.** Design-system atoms (`Button`, `Badge`, `Kbd`, `Input`, `Tabs`, `Card`) in `src/client/ui/` — reuse in TopBar, RightDock, palette. No inline objects; `styles/tokens.css` + `*.module.css`.
6. **Code-split at graph boundary.** `AppShell` lazy-loads `GraphCanvas` (d3+mermaid ≈ 250 kB) via `React.lazy + Suspense`; Vite `manualChunks` `[react, query, d3, markdown]`.
7. **Render-cost hygiene:** `memo` for `ExplorerRow`, `GraphNode`; `useCallback` stable handlers; `useMemo` only when iterating (search, graph clustering), not for primitives.

### 3.3 What is intentionally not copied from `cc-memory`

Borrow **isolation + contracts + quality gates** (`platform` as only I/O cage, vault as derived, typed Result/fail-open, `purity`/`moduleBoundaries`/`testPresence`).  
Do not copy ceremony of 10 top-level modules, `Result` monad with `match`, `AbsPath` branding, worktree slug logic, `workspace` longest-prefix `cwd→workspace`, FTS5/BM25/RRF, `install`/`session`/`cli`. Viewer is read-only HTTP proxy over FS — 3 server modules + 6 client domains is the right weight.

---

## 4. Decision — Option B argued

Considered:

| Option | Shape | When to pick |
|--------|-------|--------------|
| **A** `client/` + `server/` two `package.json` | Perfect dep isolation, but doubles `bun install`, needs third `shared` linking, versioning churn per DTO change | Client to CDN + server to serverless with divergent Node versions |
| **B** `src/client + src/server + src/shared` one `package.json`, two `tsconfig`s | One `bun install`, one lock, two `tsconfig` give real type isolation, `shared` importable as `@shared/*` with zero linking, incremental migration in 1 PR | **Now** — viewer <5k LOC, one deploy target `localhost:3415+3416` with proxy |
| **C** pnpm workspaces `packages/{shared,server,client}` | True isolation + dedup, per-package Docker, scales to 3 viewers (Console/Lab/Obsidian) | Next sprint if team commits to shipping Lab/Obsidian siblings — then shared should move to repo root |

**Chosen: B.** Cheapest path to the two blockers (F1/F2): shared Zod contracts eliminate duplicate-type drift; two `tsconfig` eliminate cross-runtime leakage with ~6 lines JSON each; both ship in one PR, no PM migration, no new lockfile, respects `bun` as frozen runtime per `CLAUDE.md` traps. Docker image still needs pruning, but that is a later concern. Migration to pnpm workspaces is a pure folder move of `shared/` if needed.

---

## 5. Proposed file structure — where what lives

### 5.1 Full tree

```
vault-viewer/
├── package.json                         # single lock — scripts split
├── bun.lock
├── tsconfig.json                        # base: strict, verbatimModuleSyntax, noEmit, paths
├── tsconfig.server.json                 # extends base; include ["src/server/**","src/shared/**"]; module nodenext
├── tsconfig.client.json                 # extends base; include ["src/client/**","src/shared/**"]; module bundler
├── vite.config.ts                       # root src/client; proxy /api → http://localhost:${API_PORT:-3416}
├── vitest.config.ts                     # projects: server + client
├── eslint.config.js                     # flat + boundaries/element-types
├── .oxfmtrc.json                        # extends ../.oxfmtrc.json
├── index.html                           # → /src/client/main.tsx
├── seed-vault/                          # unchanged fixture
├── docs/
│   └── architecture.md                  # this file
└── src/
    ├── shared/                          # ⬅ single source of truth — imported by both sides, may import nothing
    │   └── contracts/
    │       ├── workspace.contract.ts    # Zod schema + inferred type (WorkspaceDto)
    │       ├── tree.contract.ts         # TreeDto
    │       ├── note.contract.ts         # NoteDto, BacklinkDto, RelDto (tags: string[], not string)
    │       ├── search.contract.ts       # SearchHitDto, SearchQueryDto
    │       ├── graph.contract.ts        # GraphDto, EdgeDto
    │       ├── worklog.contract.ts      # WorklogSlugDto
    │       ├── rel.contract.ts          # RelationType union (links_to | … not string)
    │       ├── parser/
    │       │   ├── noteParser.ts        # parseNote() pure — owns regexes internally
    │       │   └── frontmatter.ts
    │       ├── constants.ts             # FEATURE_PALETTE, limits (graph ≤500, search ≤50)
    │       └── index.ts                 # barrel re-export only, no logic
    ├── server/
    │   ├── config/
    │   │   └── env.ts                   # Zod loadConfig(): {port, registryPath, allowedOrigins, logLevel}
    │   ├── app.ts                       # createApp(deps): Express — middleware chain, no listen
    │   ├── server.ts                    # bootstrap: loadConfig → createContainer → app.listen + graceful shutdown
    │   ├── container.ts                 # composition root: FsGateway, RegistryService, VaultCache, logger
    │   ├── errors/
    │   │   ├── appError.ts              # AppError(status, code) + NotFound/Validation/Forbidden
    │   │   └── asyncHandler.ts          # wrap async RouteHandler → next(err)
    │   ├── middlewares/
    │   │   ├── helmet.ts
    │   │   ├── cors.ts                  # cors({origin: config.allowedOrigins})
    │   │   ├── requestId.ts             # x-request-id + pino child
    │   │   ├── validate.ts              # (schema, where) → 400 {code:"VALIDATION_ERROR"}
    │   │   ├── notFound.ts
    │   │   └── errorHandler.ts          # centralized — logs 5xx, hides internals
    │   ├── gateways/
    │   │   ├── fs.gateway.ts            # interface FileSystem {readdir, readFile, stat, realpath}
    │   │   ├── fs.node.ts               # NodeFileSystem adapter
    │   │   └── registry.gateway.ts      # reads TOML + expandTilde/tildify
    │   ├── validators/
    │   │   ├── common.schema.ts         # workspaceId, relPath (no "..", no %2e), pagination
    │   │   ├── search.schema.ts
    │   │   ├── graph.schema.ts          # depth 1|2 enum, full boolean
    │   │   └── worklog.schema.ts
    │   ├── routes/
    │   │   └── index.ts                 # mounts /api/workspaces, /tree, /note, /file, /search, /graph, /worklog, /reindex
    │   ├── controllers/                 # HTTP-only — status, headers, res.json
    │   │   ├── workspaces.controller.ts
    │   │   ├── tree.controller.ts
    │   │   ├── note.controller.ts
    │   │   ├── file.controller.ts       # sandbox assertInside(root+sep) + ETag + nosniff
    │   │   ├── search.controller.ts
    │   │   ├── graph.controller.ts
    │   │   └── worklog.controller.ts
    │   ├── services/                    # domain — pure or fs-via-gateway, unit-testable
    │   │   ├── registry.service.ts      # loadWorkspaces + 60s TTL + chokidar invalidation
    │   │   ├── vault.service.ts         # walkKb, scanWorklogs (IO); delegates pure to vault.pure
    │   │   ├── vault.pure.ts            # buildKbTree, searchNotes (title×10 tags×5 body×1 relPath×2)
    │   │   ├── vault.cache.ts           # createVaultCache(fs, logger): mtime-keyed memo per kbPath
    │   │   ├── note.service.ts          # getNote + backlinks (pure over NoteFile[])
    │   │   └── graph.service.ts         # allEdges memo + BFS LRU(50)
    │   └── utils/
    │       ├── path.ts                  # expandTilde, tildify, assertInsideVault(root, abs)
    │       ├── etag.ts
    │       └── cache.ts
    └── client/
        ├── main.tsx                     # createRoot → <QueryClientProvider><ThemeProvider><AppShell>
        ├── app/
        │   ├── AppShell.tsx             # 4-panel grid: Rail + LeftDock + Main + RightDock — composition only
        │   ├── router.tsx
        │   └── providers/
        │       ├── theme.provider.tsx   # useTheme — data-theme + localStorage
        │       ├── workspace.provider.tsx
        │       └── tabs.provider.tsx    # open/close/active, persisted per WS
        ├── modules/                     # each domain owns types+hooks+components — never cross-imports sibling
        │   ├── workspaces/
        │   │   ├── hooks/useWorkspaces.ts      # useQuery(['workspaces'])
        │   │   ├── hooks/useWorkspace.ts
        │   │   ├── components/WorkspacePicker.tsx
        │   │   └── index.ts
        │   ├── explorer/
        │   │   ├── hooks/useExplorerState.ts   # expanded Set (persisted)
        │   │   ├── components/Explorer.tsx      # compound: Explorer.Root / Dir / File / WorklogGroup
        │   │   ├── components/ExplorerRow.tsx   # memo
        │   │   └── index.ts
        │   ├── notes/
        │   │   ├── hooks/useNote.ts            # useQuery(['note', ws, path])
        │   │   ├── hooks/useWikilink.ts        # resolveWikilink(target, byRel/byTitle) shared
        │   │   ├── hooks/useKnownTargets.ts    # Set<string> memo from notesMeta
        │   │   ├── components/NoteView.tsx
        │   │   ├── components/NoteBreadcrumb.tsx
        │   │   ├── components/NoteTabsBar.tsx
        │   │   └── index.ts
        │   ├── search/
        │   │   ├── hooks/useSearch.ts          # useQuery(['search',ws,q,filters]) debounced + aborted
        │   │   ├── hooks/useSearchFilters.ts
        │   │   ├── components/SearchBar.tsx
        │   │   ├── components/CommandPalette.tsx
        │   │   └── index.ts
        │   ├── graph/                          # ex-607 LOC sliced into 5 hooks + lazy canvas
        │   │   ├── hooks/useGraph.ts           # useQuery(['graph',ws,focus,depth,full])
        │   │   ├── hooks/useGraphFilters.ts
        │   │   ├── hooks/useGraphPhysics.ts    # D3 config + localStorage
        │   │   ├── hooks/useGraphInteractions.ts # zoom/drag/pin isolated
        │   │   ├── components/GraphView.tsx    # shell: header + canvas + legend
        │   │   ├── components/GraphCanvas.tsx  # SVG + D3 lifecycle only — lazy-loaded
        │   │   ├── components/GraphLegend.tsx
        │   │   ├── components/GraphConfigPanel.tsx
        │   │   └── index.ts
        │   ├── worklog/
        │   │   ├── hooks/useWorklog.ts
        │   │   ├── components/WorklogTimeline.tsx # STATE pinned + entries
        │   │   ├── components/WorklogEntryCard.tsx
        │   │   └── index.ts
        │   └── markdown/
        │       ├── hooks/useMermaid.ts
        │       ├── components/Markdown.tsx      # react-markdown + remarkGfm
        │       ├── components/Mermaid.tsx       # lazy import("mermaid") singleton
        │       └── components/Callout.tsx
        ├── services/
        │   ├── api/
        │   │   ├── client.ts           # fetch wrapper: Zod parse, error→AppError envelope, AbortController
        │   │   ├── workspaces.api.ts
        │   │   ├── note.api.ts
        │   │   ├── search.api.ts
        │   │   ├── graph.api.ts
        │   │   └── file.api.ts         # fileUrl builder
        │   └── query/
        │       ├── queryClient.ts      # QueryClient(staleTime 30s, retry 1)
        │       └── queryKeys.ts        # qk.workspaces(), qk.note(ws,p), …
        ├── ui/                         # atomic — no domain logic
        │   ├── Button.tsx
        │   ├── Badge.tsx
        │   ├── Input.tsx
        │   ├── Select.tsx
        │   ├── Tabs.tsx
        │   ├── Card.tsx
        │   ├── Kbd.tsx
        │   ├── Tooltip.tsx
        │   └── Overlay.tsx
        ├── lib/
        │   ├── storage.ts              # typed localStorage (tabs:WS, theme, graphConfig)
        │   └── path.ts
        └── styles/
            ├── tokens.css              # :root --bg --panel --accent … (only place)
            ├── globals.css
            └── reset.css
```

### 5.2 Backend detail — why flat is wrong, how MVC fixes it

| Current | Proposed | Argument |
|---------|----------|----------|
| `server/index.ts` holds 8 handlers doing `String(req.query.x)` + `join` + `walkKb` + `res.json` | `routes/index.ts` mounts URLs only → `validate(zodSchema)` → `controller` (HTTP mapping) → `service` (domain) → `gateway` (FS) | Express skill: routes are URL, controllers are HTTP, services are domain. Without it, validation/err handling cannot be centralized; tests must hit real FS. Cost is 6 extra files vs N× handler copy. |
| `try{}catch{}` swallow | `asyncHandler` + `AppError` hierarchy + global `errorHandler` | One envelope `{status,code,message,errors}` that skills can parse. Fail-open becomes explicit, not silent `[]`. |
| `process.env.API_PORT` inline per request | `config/env.ts` Zod-parsed once on boot, injected | Catches `NaN` port before `listen`, `allowedOrigins` testable via container. |
| `readdir+stat+readFile` per request, N+1 stat | `FsGateway` + `VaultCache(mtimeMs)` + `readdir({withFileTypes:true})` + `p-limit(16)` | Avoids parent-repo trap (`process.env.HOME` vs `os.homedir()`), enables `MemoryFs` fake, halves syscalls, turns `/note` backlinks from O(N) re-read to O(1) memo. |
| `relPath.includes("..")` + `startsWith(ws.kb)` | `decodeURIComponent` + `resolve` + `startsWith(root+sep)` guard + `realpath` for symlink, scoped `cors`+`helmet`+`rateLimit`+`pinoHttp` in `app.ts` | P0 security fix; ordering is contract per skill. |

`app.ts` vs `server.ts` split makes Supertest trivial: `import {createApp} from './app'` with `MemoryFs`, no `listen`, no env mutation.

### 5.3 Frontend detail — hooks as the only logic owners

**Hook contracts (single-responsibility, testable with `renderHook` + MSW):**

```ts
export function useWorkspaces() {
  return useQuery({ queryKey: qk.workspaces(), queryFn: () => workspacesApi.list() });
}
export function useNote(ws: string, relPath: string) {
  return useQuery({ queryKey: qk.note(ws, relPath), queryFn: ({signal})=> noteApi.get(ws, relPath, signal), enabled: !!relPath });
}
export function useSearch(ws: string, q: string, filters: SearchFilters) {
  const debounced = useDebounced(q, 150);
  return useQuery({
    queryKey: qk.search(ws, debounced, filters),
    queryFn: ({signal})=> searchApi.search(ws, debounced, filters, signal),
    enabled: debounced.trim().length>0 || hasFilters(filters),
  });
}
export function useTabs(workspaceId: string) {
  const [tabs, setTabs] = useState<Tab[]>(()=> storage.get(`tabs:${workspaceId}`, []));
  useEffect(()=> storage.set(`tabs:${workspaceId}`, tabs), [tabs, workspaceId]);
  const openPath = useCallback((p:string)=> setTabs(s=> s.some(t=>t.relPath===p)?s:[...s,{relPath:p,title:p.split("/").pop()!.replace(".md","")}]), []);
  return { tabs, openPath, closeTab, activePath };
}
```

**Compound components** (composition over boolean props — 4 booleans = 16 untested states):

```tsx
const ExplorerCtx = createContext<ExplorerState|null>(null);
function Explorer({children}: {children: ReactNode}) {
  const state = useExplorerState();
  return <ExplorerCtx.Provider value={state}><div className="explorer">{children}</div></ExplorerCtx.Provider>;
}
Explorer.Group = Group; Explorer.Dir = Dir; Explorer.File = File; Explorer.Worklog = WorklogGroup;

// usage — intent-explicit, each piece testable
<Explorer>
  <Explorer.Group label="KB">
    <Explorer.Dir name="auth"><Explorer.File path="auth/jwt.md" /></Explorer.Dir>
  </Explorer.Group>
  <Explorer.Group label="WORKLOGS"><Explorer.Worklog slug="_root" count={3} /></Explorer.Group>
</Explorer>
```

**Rendering & bundling:**
- `ExplorerRow`, `GraphNode`, `Markdown` in `memo`; `useCallback` stable handlers; `useMemo` only when iterating (`featureColorMap`, `filtered` search).
- `GraphCanvas` is `React.lazy` + `Suspense` — `d3`+`mermaid` (≈250 kB gz) not in initial bundle.
- Vite `manualChunks: {react:["react","react-dom"], query:["@tanstack/react-query"], d3:["d3"], markdown:["react-markdown","remark-gfm","mermaid"]}`.
- Styles own tokens once in `tokens.css`; components use `className="topbar"` / `ui/Button.module.css`, zero inline `style={{}}`.

**Data layer:** `TanStack Query` replaces 7 `useEffect+fetch` — dedup (tree+graph don't both trigger `walkKb`), `staleTime:30s`, `prefetchQuery` on wikilink hover, two `Suspense` boundaries (note body fast, right dock independent).

### 5.4 Shared contracts — single source of truth

```ts
// src/shared/contracts/note.contract.ts
import { z } from "zod";
export const relSchema = z.object({ relationType: z.string(), target: z.string() });
export const noteSchema = z.object({
  relPath: z.string().min(1),
  title: z.string(),
  type: z.string().default("note"),
  importance: z.number().int().nullable(),
  tags: z.array(z.string()),        // not space-joined string — typed array
  epic: z.string().optional(),
  body: z.string(),
  rels: z.array(relSchema),
  backlinks: z.array(z.object({ relPath:z.string(), title:z.string(), snippet:z.string() })),
  outgoing: z.array(relSchema),
  isWorklog: z.boolean(),
});
export type NoteDto = z.infer<typeof noteSchema>;
```

Server validator reuses `noteSchema`; client `noteApi.get` does `noteSchema.parse(await res.json())` — runtime guarantee plus typed return (no `any`).

### 5.5 Dependency direction (enforced, not just documented)

```
shared/contracts  ←  no imports
      ↑
  server/parser (pure) + server/vault.pure (pure)  →  server/platform/fs (only I/O seam)
      ↑                        ↑                            ↑
      └─────────────── server/vault.service (IO) ───────────┘
                              ↑
              server/services/registry + graph.service (memo)
                              ↑
                     server/controllers/*  ←  validators/* (Zod from shared)
                              ↑
                         server/app.ts (composition root)

shared/contracts → client/modules/* (hooks→services→api)  — never cross-imports sibling
                                    └→ client/ui  ← tokens.css
                                    └→ client/app/AppShell (only composer of domains)
```

`eslint-plugin-boundaries` rule:

```js
"boundaries/element-types": ["error", { default:"disallow",
  rules:[
    {from:"shared", allow:[]},
    {from:"server/pure", allow:["shared"]},
    {from:"server/io", allow:["shared","server/pure","platform"]},
    {from:"client/domain", allow:["shared","client/domain:self","ui"]},
    {from:"client/shell", allow:["shared","client/domain","ui"]},
  ]}]
```

Port `purity.test.ts` (no `node:fs` in `*.pure.ts`), `moduleBoundaries.test.ts`, `testPresence.test.ts` from `cc-memory`.

---

## 6. How to get there — stacked PRs (each green)

| PR | Scope | What lands | Fixes |
|----|-------|-----------|-------|
| **1** | Contracts | `src/shared/contracts/*.contract.ts` (Zod), re-export temporaries, `services/api` Zod-parse | F2 (drift) |
| **2** | TS isolation | `tsconfig.{server,client}.json`, `vite.config` env, `typecheck`/`build` scripts split | F3/F8 |
| **3** | Server slicing | `platform/fs`, `config/env`, `errors/*`, `middlewares/validate`, split `vault.ts` → `vault.pure`/`vault.service`+`vault.cache`, split `index.ts` → `routes+controllers/services` + `vitest+supertest` with `MemoryFs` | C-1/C-2/H-1..H-5/M-3/M-4 |
| **4** | Client slicing | Extract `AppShell`, `providers`, `modules/*` hooks, eliminate `any[]`, introduce `ui/*` atoms, move `style={{}}` → `tokens.css` classes, `TanStack Query` wiring | God splits, render hygiene |
| **5** | Tooling | `eslint` boundaries, `oxfmt`, `vitest`, `check` gate, lazy-load `GraphCanvas` + `Mermaid` | F9 + perf |

Cost: ~3 days to PR3 (highest leverage — security + testability). Graph/client modularization can land after. Each phase keeps `seed-vault` as fixture — no need for real `~/.claude/memory` in CI.

`app.ts` `createApp` with `MemoryFs` ensures integration tests run in-process, no port binding, no env mutation (avoids `process.env.HOME` vs `os.homedir()` trap).

---

## 7. Consolidated tuning constants & frozen contracts

Per `CLAUDE.md` discipline, these are not free parameters — they are pinned by tests:

- BM25-ish weights `title×10 / tags×5 / body×1 / relPath×2` in `vault.pure.ts` (divergent from main `C7` `3/1/1` and `10/1/5` — document divergence, do not reason).
- Graph physics `DEFAULT_CONFIG` (linkDistance 72, linkStrength 0.55, charge -140, collideRadius 10, clusterStrength 0.18, centerStrength 0.08), RRF k=60, compound-split tokens.
- Palette `FEATURE_PALETTE` 10-color ordered alphabetically, consistent across sessions.
- Ports: API `3416` / UI `3415` (the wireframe-variant ports Lab 3413 / Obsidian 3414 are gone — those variants were never shipped).
- Each constant lives in `*.constants.ts` with `// SAFETY:` or frozen comment and a golden test.

---

## 8. Residual risks if not fixed

- Traversal `prefix`/`%2e` remains P0 — local-only today, becomes exfiltration once networked.
- `walkKb` on 5k notes → p95 >1s per `/graph?full=1` and backlink scan without cache.
- `setTick` leak grows with vault size; simulation thrash on rapid filter changes.
- `chokidar` in `deps` unused — either wire to invalidate `workspacesCache` or remove.

---

## 9. Appendix — prior wireframe divergence (kept)

- Wireframe was static single-view; app adds real search palette (⌘K), IDE tabs (persisted per workspace), light/dark toggle via CSS vars.
- Console identity kept: Fragment Mono for body/code, Inter for titles, violet `#6C5CFF`.
- Graph now Obsidian-like via `d3-force` with per-feature clustering, pin via drag (`fx/fy`), zoom 0.18–5×, config persisted in `localStorage:consoleGraphConfig`.

---

## 10. References

- Parent `CLAUDE.md` — five invariants, frozen contracts C1..C7, traps (`os.homedir()`, `Stdio.exit`, FTS5 IDF, barrels, `import {type}`, `oxlint` via `bun`).
- Parent `docs/architecture.md` — module anatomy, file-kind taxonomy, dependency direction, purity, class conventions.
- `vault-viewer/README.md` — ports, API surface, seed fallback.
- Agent artifacts on disk: `~/.pi/agent/sessions/.../subagent-artifacts/outputs/081dddb6-*/{architecture,backend,code-quality}-audit.md`.

