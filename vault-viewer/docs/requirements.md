# vault-viewer — Strict Requirements & Phased Execution Plan

> **This is the contract.** Full `vault-viewer/` codebase redo is approved.
> Architecture target = `vault-viewer/docs/architecture.md` (Option B: `src/client + src/server + src/shared`,
> single `package.json`, two `tsconfig`s, Zod contracts, domain-vertical slices).
> This doc defines **what must work, how it must be verified, and in what order we ship**.
> Nothing ships to next phase unless its **exit criteria + Playwright verification** pass.

---

## 0. Ground rules (non-negotiable)

### 0.1 Styles stay identical

- `src/styles/console.css` tokens are **frozen**: `--bg #0A0A0B / #F2F2F3 light`, `--panel #111113`, `--accent #6C5CFF`, `--accent2 #A3FFB5`, `--red #FF4D4D`, `--amber #E6A03F`, `--muted #7A7A85`, `--border #242428`, `--radius 6px`, fonts `Fragment Mono` (body/code) + `Inter 500/600/700` (titles) + `JetBrains Mono` (if used). No palette change, no spacing change, no component-radius change.
- Layout stays **4-column grid**: `44px rail | 260px Explorer | 1fr Main | 300px Right dock`, top bar `36px`, status `20px`, tabs `32px`. If we extract CSS classes from inline `style={{}}`, the computed pixels must match — verified by Playwright screenshots per phase (see §6).
- Dark/light toggle via `data-theme` on `<html>` stays instant (no flash). Fonts stay loaded from Google Fonts URL (or self-hosted with identical metrics).
- **How we prove it:** Playwright visual comparison after **every phase** against baseline screenshots taken from current `main` on `seed-vault`. Tolerance `maxDiffPixels ≤ 50` on 1280×800, `## no-nav` masked. Any visual diff must be justified in the PR description.

### 0.2 Typesafe, clean, readable — enforced, not aspirational

- `strict: true`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess: true` (client+server), `exactOptionalPropertyTypes: true` where it does not break deps.
- **Zero `any`**. Zero `as unknown as X` without `// SAFETY:`. Zero `!` non-null assertion without preceding guard. `noImplicitAny` via lint.
- Every boundary validates: every `req.query / req.body` through Zod, every `fetch(...).json()` through Zod `parse` via `src/shared/contracts`. TS types are `z.infer` — never hand-duplicated.
- Code style: **no god files** — max 150 LOC per component/hook, 200 LOC per service, enforced by `fileKinds.test.ts`. No inline `style={{}}` objects in JSX (move to `tokens.css` + `*.module.css` / utility classes). No boolean-prop explosion — use composition (`react-composition-2026`). No logic in JSX — hooks own it (`hooks-pattern`).
- Purity: `*.pure.ts` / `*.ranker.ts` / `*.parser.ts` / `shared/**` must not import `platform/` or `node:*` — enforced by `purity.test.ts`. Every non-utils file is a class with constructor DI where applicable (backend).
- **How we prove it:** `bun run check` = `fmt:check + lint + typecheck (both tsconfigs) + test --coverage` must pass on every phase. `any`/`!`/inline-style violations are `error` in `oxlint`/`eslint`.

### 0.3 Viewer-only, files are truth, index is disposable

- No write endpoints. No auto-commit. No KB write without approval. Viewer is read-only HTTP proxy over FS. `index.db` (if ever read) is derived, not storage.
- Fail-open: missing registry → `seed-fallback`; missing kb/worklogs → empty; malformed markdown → still renders. But always **log** — no `catch{}` swallow.

### 0.4 After every iteration — Playwright MCP verification (mandatory)

- No phase is marked done without a **Playwright MCP** run in the PR (see §6 for the exact script per phase).
- Uses `playwright` MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`). Serves `seed-vault` (6 notes + 2 worklog slugs) on `localhost:3415/3416`.
- Each phase has a **named Playwright suite** (`tests/e2e/<phase>.spec.ts`). We run it via MCP and paste the headed screenshot + snapshot diff into the PR.
- If Playwright is not installed in the environment, the phase **blocks** — install it, do not skip.

---

## 1. What must work — functional requirements

### FR-1 Workspaces
- `GET /api/workspaces` reads `~/.agent/memory/registry.toml` (or `CCMEM_REGISTRY`) or falls back to `seed-vault`. Returns `{workspaces:[{id, kb, tildifiedKb, worklogs, exclude, noteCount, indexFresh, source}], source}`. `tildify` preserves `~` on write.
- UI: `<select>` in top bar shows `◈ {id} — {tildifiedKb}`, note count badge, `indexFresh` (e.g. `12m ago`, `seed`). Switching workspace reloads tree+worklogs+notes+graph.
- Validation: workspace ID must be known; unknown ID → `404 {code:"NOT_FOUND"}` — not silent fallback to first workspace (fixes H-2).

### FR-2 KB tree + worklog slugs
- `GET /api/tree?workspace=ID` returns `{kbTree: TreeNode, worklogs: WorklogSlug[], notes: NoteMeta[]}` where `TreeNode = {name, path, type:"dir"|"file", children?, isIndex?}` sorted dirs-first then alpha. Worklog `seed` has `_root` (STATE + 2 entries), `feat-x` (STATE).
- UI: Left dock `Explorer` shows `KB` (dirs `auth`, `search` with `isIndex` star) + `WORKLOGS` (each slug `📁 {slug} count`, expandable with `STATE.md` ◆ + dated entries). Active file highlighted with accent.
- Sorting: dirs first then files, each alpha case-insensitive.

### FR-3 Note reading + backlinks/outgoing
- `GET /api/note?workspace=ID&path=rel.md` — prevents traversal (case C-1 fix: `decodeURIComponent` + `resolve` + `startsWith(root+sep)` + reject `%2e/%252e/absolute/null-byte`), tries `kb/rel` then `worklogs/rel`, parses frontmatter+body, returns `NoteDto = {relPath, title, type, importance, tags:string[], epic, body, rels:[{relationType,target}], backlinks:[{relPath,title,snippet}], outgoing:[{relationType,target}], isWorklog}`. Missing param → 400, traversal → 400, outside sandbox → 403, not found → 404.
- UI: breadcrumb `feat / note.md` + `relPath` badge, `<h1>` title, pills `type`, `imp`, `tags`, `epic`, body rendered via `Markdown` (see FR-7), right dock `Backlinks`/`Outgoing`/`Tags`/`Outline`. Unresolved wikilinks render in red dashed underline.
- Backlinks: scan all notes, match `target.toLowerCase()` against `relKey`/`title`/`fallback`, snippet `±40 chars` around `[[target`, max 20.

### FR-4 Static files
- `GET /api/file?workspace=ID&path=rel.png` — same traversal+sandbox, allowlist `png/jpg/jpeg/gif/svg/webp/pdf` else `application/octet-stream`, `Content-Type` correct, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, `ETag` weak from `mtimeMs+size`, streams via `sendFile`. Missing → 404, sandbox → 403.
- UI: `Markdown` `<img>` resolves relative `src` against note dir, rewrites to `fileUrl(workspace, full)`, rendered with `max-width:100%` + border + shadow. Not fetched via proxy bypass.

### FR-5 Search
- `GET /api/search?workspace=ID&q=&type=&tag=&feature=` — Zod-validated, scoring `title×10 / tags×5 / body×1 / relPath×2` (frozen, matches `vault.pure.ts`), `terms = q.split(/\s+/)` lower-cased, `slice(0,50)` sorted desc. Empty q + no filters → `[]` (not full dump). Filters exact.
- UI: top bar `⌕` input + `⌘K` palette overlay (640px, `rgba(0,0,0,.45)` backdrop, ESC to close, `⌘K` toggle). Palette shows filters `type:spec tag:auth feature:auth`, result count, hit rows with `≡` icon + title + snippet + `relPath` + `type` badge, click → `openPath`. Debounce 150ms with `AbortController` cancellation.

### FR-6 Graph
- `GET /api/graph?workspace=ID&focus=&depth=1|2&full=0|1` — Zod-validated (`depth` enum, `full` boolean). Builds `byRel`, `byTitleLower`, `allEdges` with resolution `tryPaths=[target.md,target,titleLower]`, full vault `≤500 nodes` + `visible edges`, focused via BFS 1–2 hops from `focus` with memo `LRU(50)` per `(focus,depth)` + edges memo per `notes` identity. Returns `{nodes:[{id=relPath,title,type,importance,tags}], edges:[{source,target,relationType}]}`.
- UI: `GraphView` (Obsidian-like `d3-force`): header `Depth 1/2`, filters `type/tag/feature`, `⚙ Config` panel with 6 sliders (Link distance 24–160, Link strength 0.05–1, Repulsion −420–−20, Collision 2–22, Cluster 0–0.5, Center gravity 0–0.4) persisted in `localStorage:consoleGraphConfig` + Reset, `→ Full vault / → Focused` toggle, SVG 900×520 `viewBox`, nodes colored per feature (palette `#6C5CFF #2A9D8F #E6A03F #FF4D4D #3B82F6 #A3FFB5 #F97316 #8B5CF6 #06B6D4 #84CC16` ordered alpha, loose `#7A7A85`), edges same-feature `1.6px 0.75` vs `1px 0.45`, focus halo + pinned amber ring (dbl-click unpin), drag to pin (`fx/fy`), scroll 0.18–5×, drag background pan, dbl-click background reset, degree dot for degree>3, label truncated 20, legend + hint overlays. Click node → `openPath`. Loading `Loading graph…`.
- Perf: `setTick` loop removed — rAF batch, stable deps, no simulation leak.

### FR-7 Markdown rendering
- `Markdown` uses `react-markdown + remark-gfm`, `wikilink://` custom scheme, `![[Target]]` → `> [!EMBED]`, `[[T|Alias]]` → `[Alias](wikilink://T)`, inline `#tags` preserved, callouts `[!NOTE]/[!WARNING]` left-border colored, code `language-mermaid` → lazy `mermaid` singleton `render(id, code)` with theme `dark/default` per `data-theme`, `img` rewritten to `fileUrl`, `blockquote` styles per type, inline vs block `code` distinguished.
- Known-vs-unresolved link coloring: known `#6C5CFF` solid underline, unresolved `#FF4D4D` dashed `opacity .85`.

### FR-8 Worklog timeline
- `GET /api/worklog?workspace=ID&slug=_root` → `{slug, stateExists, stateBody?, entries:[{date, body, relPath}]}` sorted `date desc`. Unknown slug → `404 {error:"slug not found", slugs}` not full dir leak? After redo: `404 {code:"NOT_FOUND"}`.
- UI: when `activePath` is `{slug}/STATE.md` or `YYYY-MM-DD.md` under known `worklogs[].slug` → timeline view: slug `<select>` + `{count} entries` + `activePath` muted, `STATE.md — pinned` card with amber left border if `stateExists`, entries each with `date` badge + `relPath` + `Markdown(body)`, right dock `Date jump` list clicking `scrollIntoView({behavior:"smooth"})`.

### FR-9 Tabs + worklog focus + persistence
- Tabs: `openPath(p, newTab?)` adds `{relPath, title}` if not existing, `activePath` set; click tab → `activePath`; `×` closes and falls back to `tabs[idx] ?? tabs[idx-1] ?? tabs[0]`. Persisted per workspace in `localStorage: tabs:{workspaceId} → Tab[]` (currently `tabs:seed` → `tabs:${activeWs}`).
- Mode: `Notes | Graph` toggle in top bar + rail `⬡`; `Graph` mode shows `GraphView` centered, `Notes` mode shows note/worklog/empty/not-found.
- Theme: `useTheme()` `dark|light` persisted `localStorage:theme`, `documentElement.setAttribute("data-theme", theme)`.
- Key: `⌘K / Ctrl+K` toggles palette, `Escape` closes it.

### FR-10 Reindex + status bar
- `POST /api/reindex?workspace=ID` (and/or body `{workspace}`) — Zod-validated, busts `workspacesCache` / `VaultCache`, returns `{total, added, updated, removed}` honestly (or at least `{total}` + `added=total` for now, but not fake diff + must not use both query+body ambiguity). Bust must be atomic, not racy `global null`.
- UI: status bar `20px` violet `#6C5CFF` shows `{noteCount} notes · index {indexFresh} · vault: {tildifiedKb} · [Reindex] · localhost:3415 · console · viewer only`. Button shows `Reindexing…` toast 2.5s `Reindexed: {total} notes` and refreshes tree.

### FR-11 Proxy + dev
- `vite.config.ts` proxy `/api → http://localhost:${API_PORT:-3416}` reading env (not hard-coded). `dev` via `concurrently --kill-others-on-fail --names api,ui "bun run dev:server" "bun run dev:client"` or `bun --parallel`. `CTRL+C` kills both, no orphan.

### FR-12 Non-functional (read from `vault-viewer/README.md` API + Design preserved)

- Viewer-only — no editing. Files are source of truth. Fail-open with logging (not silent `catch{}`).
- Design preserved: `console` variant (dense mono, `#0A0A0B / #111113`, violet accent). No edit breaks visual identity (verified via Playwright screenshots per phase).
- Ports: UI `3415`, API `3416` (do not clash Lab 3413 / Obsidian 3414).

---

## 2. API contract — the backend must expose these verbatim (Zod is source of truth)

All routes are `GET` except `POST /api/reindex`. All query `workspace` is `z.string().min(1)`; `path`/`slug` validated via `isSafeRelPath` (decode + reject `..`/`%2e`/`%252e`/`//`/`\0`/absolute). Violations → `400 {code:"VALIDATION_ERROR", errors}`. Unknown workspace with explicit param → `404 {code:"NOT_FOUND"}`; missing workspace param → fallback to `workspaces[0]` only if single workspace (preserves current UX but fixes silent exfiltration). Sandbox failure → `403 {code:"FORBIDDEN"}`. Global error envelope: `{status:"error", code, message, errors?, requestId?}`.

| Route | Query / Body | Success `200` shape | Auth |
|-------|--------------|---------------------|------|
| `GET /` | — | `{message:"cc-memory API — UI is at http://localhost:3415", api:"/api/workspaces", worktrees:"../cc-memory-*"}` | none |
| `GET /api/workspaces` | — | `{workspaces: WorkspaceDto[], source:"registry"|"seed-fallback"}` where `WorkspaceDto={id,kb,tildifiedKb,worklogs,exclude:string[], noteCount:number, indexFresh:string, source}` | none |
| `GET /api/tree` | `workspace=ID` | `{kbTree: TreeNodeDto, worklogs: WorklogSlugDto[], notes: NoteMetaDto[]}` | none |
| `GET /api/note` | `workspace=ID&path=rel.md` | `NoteDto` | none |
| `GET /api/file` | `workspace=ID&path=rel.png` | stream + headers (`Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control`, `ETag`, `Content-Disposition: inline`) | none |
| `GET /api/search` | `workspace=ID&q=&type=&tag=&feature=` | `{hits: SearchHitDto[]}` `≤50` sorted desc | none |
| `GET /api/graph` | `workspace=ID&focus=&depth=1|2&full=0|1` | `{nodes: GraphNodeDto[], edges: GraphEdgeDto[]}` `≤500 nodes` | none |
| `GET /api/worklog` | `workspace=ID&slug=_root` | `WorklogDto={slug, stateExists, stateBody?, entries: WorklogEntryDto[]}` | none |
| `POST /api/reindex` | `?workspace=ID` or `body:{workspace}` (but validated — query wins, body ignored if both) | `{total:number, added:number, updated:number, removed:number}` (`updated/removed 0` honest) | none |

`src/shared/contracts/*.contract.ts` exports these Zod schemas + `type = z.infer`. No handler constructs response shape ad-hoc — controller maps service result through schema and throws `ValidationError` if it does not parse (guards drift).

---

## 3. Quality — typesafe, clean, readable

- `tsconfig.server.json` / `client.json` both `strict` + `verbatimModuleSyntax` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` where safe. `tsc --noEmit` per target in `typecheck`.
- `oxlint` + `oxfmt` via `bun` (Node ≥22.18 trap — never `npx`). `oxlint` has `no-any`, `no-non-null-assertion` (allow with `// SAFETY:`), `no-console` (backend via `pino` only), import order.
- `eslint-plugin-boundaries` — `shared ← pure ← io ← domains ← app` (server), `shared → ui` and `modules/*` never cross-import sibling, only `client/app/AppShell` composes domains. Violations are `error`.
- File budget: hook/component ≤150 LOC, service ≤200 LOC, no inline `style={{}}`, no `as any`, no `catch{}` without `logger.warn({path,err,requestId})`.
- Purity: `shared`, `*.pure.ts`, `*.ranker.ts`, `*.parser.ts` may not import `node:*` / `platform/`. `src/quality/purity.test.ts` + `moduleBoundaries.test.ts` + `fileKinds.test.ts` + `testPresence.test.ts` (each impl has test beside it) are copied into `vault-viewer/` with adjusted globs.
- Class convention on backend: every `*.service.ts` / `*.gateway.ts` / `*.adapter.ts` is a class `XService` with constructor-injected ports, no extends, no static singletons, top-level instance only in `container.ts`.

---

## 4. Phased execution — order, what to test, how, exit criteria

> Full redo is approved — we delete and re-create, not patch. Each phase is stacked
> on the previous. `seed-vault` (6 notes + 2 worklog slugs) is the fixture for all tests.
> After every phase we run **§6 Playwright MCP suite** for that phase and paste screenshots.

### Phase 0 — Scaffolding & toolchain (no behavior change, but enables everything)

**Do:**
- Create `src/shared/contracts/` with Zod schemas for all 8 routes (derive types via `z.infer`). Keep `src/types.ts` re-exporting from contracts temporarily.
- Split `tsconfig.json` → `tsconfig.json` (base) + `tsconfig.server.json` + `tsconfig.client.json` + update `vite.config.ts` to read `API_PORT` env.
- Add `vitest.config.ts`, `eslint.config.js` (boundaries), `.oxfmtrc.json` (extends `../`), install `zod`, `helmet`, `pino`, `pino-http`, `dotenv`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `supertest`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `oxlint`, `oxfmt`, `eslint-plugin-boundaries`.
- Add scripts in `package.json`:
  ```json
  {
    "dev": "concurrently --kill-others-on-fail --names api,ui \"bun run dev:server\" \"bun run dev:client\"",
    "dev:server": "bun --watch src/server/server.ts",
    "dev:client": "vite --port ${UI_PORT:-3415}",
    "build": "bun run build:server && bun run build:client",
    "build:server": "bun build src/server/server.ts --target=bun --outdir dist/server",
    "build:client": "vite build",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit",
    "lint": "bun ./node_modules/.bin/oxlint",
    "fmt": "bun ./node_modules/.bin/oxfmt .",
    "fmt:check": "bun ./node_modules/.bin/oxfmt --check .",
    "test": "vitest run",
    "check": "bun run fmt:check && bun run lint && bun run typecheck && vitest run --coverage"
  }
  ```
- Ensure `seed-vault/` is the Vitest fixture (no real `~/.agent/memory` in CI).

**Test:**
- `bun run typecheck` passes for both targets (proves no cross-runtime leak: `server` cannot import `react`, `client` cannot import `node:fs`).
- `bun run lint` passes (no `any`/inline-style yet — just baseline).
- Backend contract unit tests: `src/shared/contracts/*.test.ts` round-trips `seed-vault` JSON through each Zod schema.

**Playwright (Phase 0):** baseline capture — `tests/e2e/phase0-baseline.spec.ts` navigates `/` on current `main`, takes screenshots `baseline-dark` + `baseline-light` at 1280×800, snapshots Explorer/tree + note + palette + graph + worklog. These become the visual golden images for all later phases.

**Exit criteria:** `bun run check` green, no behavior change (`bun run dev` still shows same console), `src/shared/contracts` imported by both sides via `@shared/*` alias, baseline screenshots committed to `tests/e2e/__screenshots__/`.

---

### Phase 1 — Backend hardening: config + errors + validation + sandbox (P0 security)

**Do:**
- `src/server/config/env.ts` — Zod `loadConfig()` (API_PORT, CCMEM_REGISTRY, CORS_ORIGINS, LOG_LEVEL, NODE_ENV) + `dotenv`. All `process.env` reads go through it; `server.ts` throws on invalid env before `listen`.
- `src/server/errors/*` — `AppError` hierarchy + `asyncHandler` + `errorHandler` (always last) + `requestId` middleware. Replace all `catch{}` with `logger.warn({path,err,requestId})`. Fix H-2: `requireWorkspace(id)` → `404` when explicit `workspace` param not found.
- `src/server/middlewares/validate.ts` + `src/server/validators/*.schema.ts` — wrap **every** route (`workspaces` has none, `tree/note/file/search/graph/worklog/reindex` all validated). Fix H-3 (`depth` enum, `full` boolean, `q` not array).
- `src/server/utils/path.ts` — `assertSafeRelPath(raw)` (decode, reject `..`/`%2e`/`%252e`/`//`/`\0`/absolute) + `assertInside(root, target)` (`resolve` + `startsWith(root+sep)` + `realpath` for symlink). Apply to `note`, `file`, and anywhere `relPath` is used. Fixes C-1 prefix bypass.
- `src/server/app.ts` + `src/server/server.ts` split — `createApp(deps)` owns middleware chain `helmet → cors(configured) → pinoHttp → routes → 404 → errorHandler`; `server.ts` alone calls `listen` + graceful `SIGTERM`. Removes `index.ts` god-file entry point.

**Test:**
- Unit: `validators/*.test.ts` — traversal cases: `../etc/passwd`, `%2e%2e%2f`, `%252e`, `//`, `\0`, `a/b/../../c`, `auth/../../secret.md`, absolute `/etc/passwd`, `vault` vs `vault-evil` prefix.
- Integration (`supertest` against `createApp` with `MemoryFs` + `testConfig` — no port binding):
  - `GET /api/note?path=../etc/passwd` → 400 `VALIDATION_ERROR`
  - `GET /api/file?path=../etc/passwd` → 403 `FORBIDDEN` or 400 depending on layer
  - `GET /api/search?depth=NaN` → 400
  - `GET /api/tree?workspace=unknown` (explicit) → 404 (not 200 fallback)
  - `GET /api/file?path=auth/jwt.md&workspace=unknown` → 404
- `bun run check` green (new files have `*.test.ts` beside them, `testPresence` passes).

**Playwright (Phase 1):** API contract suite — `phase1-api.spec.ts` via `request` fixture hits live server on `seed-vault`: asserts `GET /api/workspaces` shape, `GET /api/tree` TreeNode ordering, `GET /api/note?path=auth/jwt.md` title/tags, `GET /api/file?path=auth/jwt.md` header `Content-Type` + `nosniff`, `GET /api/search?q=jwt` ≥1 hit, `GET /api/graph?focus=auth/jwt.md&depth=1` BFS 1 hop, unknown workspace 404. Screenshots unchanged vs baseline (no UI change).

**Exit criteria:** `supertest` traversal suite passes, `bun run check` green, Playwright API contract green, no UI regression.

---

### Phase 2 — Backend domain: FS gateway + vault cache + pure extraction (perf + testability)

**Do:**
- `src/server/gateways/fs.gateway.ts` — `interface FileSystem {readdir(path, opts?): Promise<Dirent[]>, readFile, stat, realpath}` + `NodeFileSystem` + `MemoryFileSystem` fake (mirrors parent `src/testing/fakes/FileSystemFake`). Inject via `container.ts`.
- Move `server/parser.ts` → `src/server/services/parser/noteParser.ts` + `frontmatter.ts` — own regexes internally (not exported mutable), `tags: string[]` not `string` (migration adapter `join(" ")` on response if client still expects string — but prefer fixing client to `string[]` now). Add `// SAFETY:` where needed.
- `src/server/services/vault.pure.ts` — extract `buildKbTree`, `searchNotes` (scoring `title×10 tags×5 body×1 relPath×2` frozen) as pure, no `node:*`.
- `src/server/services/vault.service.ts` — `walkKb(fs, logger, kbPath, exclude)` using `Dirent` + `p-limit(16)` per dir, no N+1, no swallow; `scanWorklogs` split into `scanAll` + `scanOne(slug)` (fixes `GET /worklog` wasteful scan-all). All IO goes through `FileSystem`.
- `src/server/services/vault.cache.ts` — `createVaultCache(fs, logger): {get(kbPath, exclude): Promise<NoteFile[]>, invalidate, watch?}` mtime-keyed (`Dirent` mtime or `stat(kbPath).mtimeMs`) + optional `chokidar` invalidation or `fs.watch`. All routes (`tree`, `note`, `search`, `graph`, `worklog`) read from cache, not `walkKb` per request. Wire in `container.ts`.
- `src/server/services/registry.service.ts` — TTL 60s + `p-limit(1)` mutex + `workspacesCache` no longer global mutable; reads via `FsGateway`.
- `src/server/services/note.service.ts` — pure `getNote + backlinks(read, notes, relPath)` extracted; `GET /note` becomes `validator → controller → noteService.getNote`.
- `src/server/services/graph.service.ts` — memo `allEdges` per `notes` identity (`notes.length + max(mtimeMs)` hash) + `LRU(50)` per `(focus,depth)`; `GET /graph` filters to 500 nodes *before* building edges; cap `edges.slice(0,2000)` guard.
- Compress `compression` middleware, `ETag`/`Cache-Control` for `/tree`/`/graph`/`/file`.

**Test:**
- Unit: `vault.pure.test.ts` (golden on `seed-vault`: `buildKbTree` shape, `searchNotes` ranking for `q=jwt` + `tag:auth`/`feature:auth`/`type:spec`), `noteParser.test.ts` (frontmatter, wikilink, tags), `graph.service.test.ts` (memo, BFS 1/2 hops, 500 cap).
- Integration: `supertest` on `createApp({fs: MemoryFs(seedFixtures)})` — `GET /api/note` backlinks correctness, `GET /api/graph?full=1` node count, `GET /api/search` scoring order, `GET /api/worklog?slug=_root` STATE pinned.
- Perf: bench `walkKb` with `Dirent` vs old (p50 <50ms on seed, 500 notes <200ms).

**Playwright (Phase 2):** No UI change yet, but **perf + correctness** suite — `phase2-vault.spec.ts` loads note `auth/jwt.md`, asserts backlinks count ≥1, outgoing links clickable, graph `Full vault` ≤500 nodes, `Search jwt` hits `jwt.md` first, worklog `_root` timeline shows `STATE.md` pinned amber card + 2 dated entries. Screenshots still pixel-identical to baseline.

**Exit criteria:** `walkKb` no longer called per request (log proves), cache hit rate >90% on second request, `bun run check` green, Playwright vault suite green.

---

### Phase 3 — Shared contracts as truth + typed API client

**Do:**
- Promote `src/shared/contracts` to real SSO: every controller response is `contractSchema.parse(dto)` before `res.json` (guards drift). Remove `src/types.ts` (now just re-export from `@shared/contracts`).
- `src/client/services/api/client.ts` — typed fetch wrapper: `parseOrThrow(schema, json)`, envelope error mapping `{code, message, errors} → AppError`, `AbortController` per query, `base = "/api"` via config not hard-coded.
- Typed clients: `workspaces.api.ts`, `tree.api.ts`, `note.api.ts`, `search.api.ts`, `graph.api.ts`, `worklog.api.ts`, `file.api.ts` — each returns `Dto` not `any`.
- Backend `POST /api/reindex` semantics fixed: validates `body:{workspace?: string}` via Zod, query wins if both, busts `VaultCache` atomically, returns honest `{total, added, updated, removed}` with `updated/removed 0` but `total` correct.

**Test:**
- Contract tests: `src/shared/contracts/*.test.ts` already, plus `tests/contracts/api-roundtrip.test.ts` — Supertest hits each endpoint and `DtoSchema.parse(res.body)` passes; `any` audit via `eslint` (`no-explicit-any: error`) fails if `any` remains.
- Unit: `api/client.test.ts` — 400/404/403 error mapping, abort cancellation, Zod parse failure → `ValidationError`.

**Playwright (Phase 3):** Typed client parity — `phase3-contracts.spec.ts` via `page.route` intercept: mock `GET /api/note` with `NoteDto` shape mismatch and assert UI shows error toast not silent `[]`; then restore real route and assert note `auth/jwt.md` renders identical to baseline. No visual regression.

**Exit criteria:** No `any` in `src/client/services/api/**`, every route response Zod-parsed on both sides, `bun run check` green.

---

### Phase 4 — Frontend domain slicing: hooks + compound components + Query (the big redo)

> **This is where the full codebase redo lands.** No file-level patches — we delete `src/App.tsx`'s god body and re-create each domain. Styles stay frozen (§0.1).

**Do (in this order — each sub-phase is a commit before moving on):**

1. **`ui/` atoms** — `Button`, `Badge`, `Kbd`, `Input`, `Select`, `Tabs`, `Card`, `Tooltip`, `Overlay` (each `ui/<Name>.tsx` + `*.module.css`). Move tokens from inline `style={{}}` to `tokens.css` + `ui/*.module.css`. Used by all later phases.
2. **`app/providers`** — `theme.provider.tsx` (dark|light, `data-theme`, `localStorage:theme`), `workspace.provider.tsx` (activeWs via `useWorkspaces`), `tabs.provider.tsx` (open/close/active, `localStorage:tabs:${ws}`). Extract `useTheme`, `useWorkspace`, `useTabs` from `App.tsx`.
3. **`modules/workspaces`** — `useWorkspaces` (`useQuery(['workspaces'])`), `WorkspacePicker` (select + `◈` + tildified), `WorkspaceBadge` (noteCount, indexFresh). Header select wired to `workspace.provider`.
4. **`modules/explorer`** — `useExplorerState` (expanded `Set<string>` persisted, not magic `new Set(["","auth",…])`), `Explorer` compound (`Explorer.Group / Dir / File / WorklogGroup` with Context + `ExplorerRow` memo). Replace `Row` recursion with `Explorer.Dir` self-recursion.
5. **`modules/notes` + `modules/markdown`** — `useNote`, `useWikilink` (single `resolveWikilink(target, {byRel,byTitle})` shared pure from `@shared`), `useKnownTargets`, `NoteView` (breadcrumb + pills + `Markdown`), `Markdown` (`react-markdown + remarkGfm`, `wikilink://`, `![[ ]]]` embed, callouts, `Mermaid` lazy singleton + `img` via `fileUrl`). `Markdown` no longer recreates regex per body.
6. **`modules/search`** — `useSearch` (debounced 150ms + `AbortController`, `useQuery(['search',ws,q,filters])`), `useSearchFilters`, `SearchBar` (top bar), `CommandPalette` (overlay + filters + hit rows `SearchHitRow` memo). Palette keyboard `⌘K` + `Escape` stays.
7. **`modules/worklog`** — `useWorklog`, `WorklogTimeline` (STATE pinned amber + entries), `WorklogEntryCard`, `DateJumpRail`.
8. **`modules/graph`** — `useGraph`, `useGraphFilters`, `useGraphPhysics` (6 sliders + `localStorage:consoleGraphConfig` + Reset), `useGraphInteractions` (zoom/drag/pin), `GraphView` shell + `GraphCanvas` (SVG + D3 lifecycle, **lazy-loaded** via `React.lazy + Suspense`), `GraphLegend`, `GraphConfigPanel`. Remove `setTick(t=>t+1)` — rAF batch.
9. **`app/AppShell.tsx`** — 4-panel composition only: `<Rail/><LeftDock><Explorer/></LeftDock><Main><Tabs/><Note|Graph|Worklog/><Main/><RightDock><Backlinks/><RightDock/><StatusBar/>` + `TopBar` (workspace picker + search + Notes/Graph toggle + theme). No state owned here — only composition.
10. **Query wiring** — `services/query/queryClient.ts` (`staleTime 30s, retry 1`), `queryKeys.ts`, `QueryClientProvider` at `main.tsx` root. Every `useQuery` replaces prior `useEffect+fetch`. `prefetchQuery` on wikilink hover, two `Suspense` boundaries (Main vs Right dock).

**Test (per sub-phase, not just at the end):**
- Unit: each hook via `renderHook + QueryClientProvider + MSW` — `useWorkspaces` lists, `useNote` fetches + returns `NoteDto`, `useSearch` debounces + aborts on workspace switch, `useTabs` persists, `useExplorerState` toggles.
- Component: `@testing-library/react` + `jsdom` — `ExplorerRow` memo, `SearchHitRow` click → `openPath`, `GraphCanvas` renders SVG without crashing (mock `d3`), `Markdown` renders wikilinks with correct `isKnown` color, `CommandPalette` filters.

**Playwright (Phase 4 — per sub-phase, see §6 for scripts):**
- `phase4a-ui-atoms.spec.ts` — atoms render with correct CSS vars (computed `background` matches `--panel`).
- `phase4b-workspaces.spec.ts` — workspace picker shows seed, switch reloads tree.
- `phase4c-explorer.spec.ts` — KB `auth` expand → `jwt.md` click → Main shows `jwt` note.
- `phase4d-notes.spec.ts` — note `auth/jwt.md` title + pills + markdown + backlinks/outgoing + resolved/unresolved link colors + `img` src rewritten.
- `phase4e-search.spec.ts` — `⌘K` palette, type `jwt`, filters `tag:auth`, hit click → note.
- `phase4f-worklog.spec.ts` — `feat-x/STATE.md` click → timeline with pinned STATE + entries + date jump smooth.
- `phase4g-graph.spec.ts` — toggle `Graph`, `Depth 1/2`, `Full vault`, `⚙ Config` sliders persist, drag node pins (amber ring), dbl-click unpins, zoom/pan, click node → tab.
- **Full regression** `phase4-full.spec.ts` — walks the entire app on `seed-vault` (open palette, search, open note, switch graph, change filters, open worklog, reindex, theme toggle) and asserts no console error + screenshots pixel-identical to baseline ±50px.

**Exit criteria:** `src/App.tsx` is now `AppShell.tsx` ~90 LOC shell (no god), no inline `style={{}}`, no `any[]`, `GraphView` split into 5 hooks + lazy canvas with no `setTick` loop, `bun run check` green (`purity` + `moduleBoundaries` + `testPresence` adapted with globs), **all Phase 4 Playwright suites green**.

---

### Phase 5 — Tooling, bundling & polish (no behavior change)

**Do:**
- `eslint.config.js` boundaries + `oxlint` (15 anti-slop rules via vendored plugin) + `oxfmt` gate already, now enforce `no-any`, `no-inline-style`, `no-catch-without-log`, `no-barrel-cycle`.
- `vite.config.ts` `manualChunks` + `optimizeDeps.include` + `bundle-analyzer` run (`npx vite-bundle-visualizer`) — assert initial JS <170 kB gz, graph+mermaid not in initial chunk.
- Fonts: either keep Google Fonts or self-host with identical metrics — if self-host, add `preconnect` and network check in Playwright (no external request failure breaks offline dev).
- `tests/e2e/` goldens: commit baseline screenshots, add `tests/e2e/utils/visual.ts` helper with `maxDiffPixels`.
- `README.md` Architecture section updated + `bun run check` gate documented. `dev` proxy reads `API_PORT` env.

**Test:**
- `bundle-analyzer` report <170 kB initial gz, no `express` in client chunk, `d3` in `graph` chunk.
- `bun run check` green from clean `rm -rf dist` (stale build mask test).
- Structural tests: `src/quality/purity.test.ts`, `moduleBoundaries.test.ts`, `fileKinds.test.ts`, `testPresence.test.ts` passing on `vault-viewer/` globs.

**Playwright (Phase 5):** Final visual audit — `phase5-final.spec.ts` runs headed, captures `fullPage` screenshots dark+light, asserts `palette` modal, `graph` interactions, `note` with mermaid `graph TD` if present, compares to Phase 0 baselines (tolerance 50px). Also asserts offline (fonts not fetched after first load) if self-hosted.

**Exit criteria:** `bun run check` from `rm -rf dist` green, bundle report attached to PR, Phase 5 screenshots identical to baseline, docs updated.

---

## 5. What to test — how (the matrix)

| Layer | Tool | What it proves | When it gates |
|-------|------|----------------|---------------|
| **Contracts** | `vitest` on `src/shared/contracts/*.test.ts` + `DtoSchema.parse` round-trip on `seed-vault` JSON | No drift between server/client, Zod catches malformed `tags`/extra fields | Every phase (Phase 0–5) |
| **Pure logic** | `vitest` table-driven: `vault.pure.test.ts`, `noteParser.test.ts`, `graph.service.test.ts`, `search ranker` goldens | Ranking weights, tree sorting, parser edge cases (typed rel vs links_to dedup) | Phase 2+ |
| **Hooks** | `vitest` + `renderHook` + `@testing-library/react` + `QueryClientProvider` + `MSW` | Debounce, abort, tabs persistence, explorer expand, knownTargets | Phase 4 |
| **Integration** | `supertest` against `createApp({fs: MemoryFs})` — no port, no real `~` | Status codes, validation 400/404/403, sandbox, cache hit, traversal regressions | Phase 1+ |
| **E2E functional** | Playwright MCP `browser_*` on live `localhost:3415` with `seed-vault` | User can do every FR-1..FR-10 flow end-to-end | Phase 1–5 (phase-specific suites) |
| **Visual** | Playwright `browser_take_screenshot` + diff vs baseline `tests/e2e/__screenshots__/baseline-*.png` | Styles frozen (§0.1) — no accidental palette/spacing regression | **Every phase** |
| **Perf** | `vault.cache` hit logging + `vite-bundle-visualizer` + bench `walkKb` | Cache hit >90%, p95 <1s on 500 nodes, initial JS <170 kB gz | Phase 2, 5 |
| **Structural** | `src/quality/*` (purity, boundaries, fileKinds, testPresence) | No `platform` leak, no cycles, every file has test, no barrels | Phase 0+, enforced by `check` |

---

## 6. Playwright MCP — how we verify after each iteration (copy-paste scripts)

> Each phase's suite lives at `tests/e2e/<phase>.spec.ts` and is executed via **Playwright MCP**
> (not `bunx playwright` alone — the PR must contain a headed MCP run). The pattern is:
> `bun run dev` in two terminals (or `bun run dev` concurrently), then MCP `browser_navigate`
> to `http://localhost:3415`, then the steps below, then `browser_take_screenshot` (fullPage).

### 6.1 Phase 0 — baseline capture

```ts
// tests/e2e/phase0-baseline.spec.ts
import { test, expect } from "@playwright/test";
test("baseline dark + light", async ({ page }) => {
  await page.goto("http://localhost:3415");
  await expect(page.getByRole("combobox").first()).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme","dark"));
  await page.waitForTimeout(150);
  await expect(page).toHaveScreenshot("baseline-dark.png", { maxDiffPixels: 50 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme","light"));
  await page.waitForTimeout(150);
  await expect(page).toHaveScreenshot("baseline-light.png", { maxDiffPixels: 50 });
  // palette
  await page.keyboard.press("Meta+K");
  await expect(page.getByPlaceholder(/Search notes/)).toBeVisible();
  await expect(page).toHaveScreenshot("baseline-palette.png", { maxDiffPixels: 50 });
});
```

MCP run: `browser_navigate` → `browser_snapshot` top bar (select `◈ seed — …`, `⌕`, `⌘K`, `Notes|Graph`, `◐`), rail `◧ ⌕ ⬡ ≡`, Explorer `KB`/`WORKLOGS`, Main empty `No note open…`, then `browser_evaluate` theme toggle, then `browser_take_screenshot`.

### 6.2 Phase 1 — API contract

```ts
// tests/e2e/phase1-api.spec.ts
test("api contracts & sandbox", async ({ page, request }) => {
  const ws = (await (await request.get("http://localhost:3416/api/workspaces")).json()).workspaces[0].id;
  const tree = await (await request.get(`http://localhost:3416/api/tree?workspace=${ws}`)).json();
  expect(tree.kbTree.children.length).toBeGreaterThan(1);
  const note = await (await request.get(`http://localhost:3416/api/note?workspace=${ws}&path=auth/jwt.md`)).json();
  expect(note.title).toBeTruthy(); expect(note.backlinks.length).toBeDefined();
  expect((await request.get(`http://localhost:3416/api/file?workspace=${ws}&path=auth/jwt.md`)).headers()["x-content-type-options"]).toBe("nosniff");
  expect((await request.get(`http://localhost:3416/api/note?workspace=${ws}&path=../etc/passwd`)).status()).toBe(400);
  expect((await request.get(`http://localhost:3416/api/file?workspace=${ws}&path=../etc/passwd`)).status()).toBe(400);
  expect((await request.get(`http://localhost:3416/api/tree?workspace=__nope__`)).status()).toBe(404);
  // UI unchanged
  await page.goto("http://localhost:3415");
  await expect(page).toHaveScreenshot("phase1-ui-parity.png", { maxDiffPixels: 50 });
});
```

MCP: `browser_navigate` + `browser_evaluate` `fetch` probes for 400/403/404, then `browser_take_screenshot`.

### 6.3 Phase 2 — vault perf suite (no UI diff)

Visual parity still required, plus functional: open `auth/jwt.md` → backlinks ≥1, outgoing clickable, `search?q=jwt` first hit is `jwt.md`, `graph?full=1` ≤500 nodes (MCP clicks `→ Full vault`).

### 6.4 Phase 4 — per-domain functional + full regression

Each sub-phase (4a–4g) has one `tests/e2e/phase4<letter>-*.spec.ts`:

- `phase4a-ui-atoms`: compute `getComputedStyle(button).background` matches `var(--panel)` value.
- `phase4c-explorer`: `browser_click` Explorer `auth ▸` → `jwt.md` → `browser_snapshot` Main shows `h1 jwt` + breadcrumb.
- `phase4e-search`: `browser_click` search bar, `browser_type` `jwt`, `browser_snapshot` palette shows `Results · …`, `browser_click` hit row → note.
- `phase4f-worklog`: `browser_click` `feat-x ▸ STATE.md` → `browser_snapshot` timeline pinned card amber left border + entries.
- `phase4g-graph`: `browser_click` rail `⬡` → `browser_snapshot` graph SVG visible + legend, drag node (MCP `browser_drag` if available or JS dispatch), `browser_click` `⚙ Config` → sliders visible.
- `phase4-full`: single end-to-end walk (`⌘K` → note → graph → filters → worklog → Reindex → theme) + `expect(page).toHaveScreenshot("phase4-full.png")`.

### 6.5 Phase 5 — final visual audit

```ts
test("final — pixel parity to phase0 baselines", async ({ page }) => {
  await page.goto("http://localhost:3415");
  await expect(page).toHaveScreenshot("baseline-dark.png", { maxDiffPixels: 50 });
  await page.evaluate(() => page.evaluate(()=> document.documentElement.setAttribute("data-theme","light")));
  await expect(page).toHaveScreenshot("baseline-light.png", { maxDiffPixels: 50 });
});
```

Plus `vite-bundle-visualizer` report attached.

---

## 7. Acceptance — definition of done (per phase AND at end)

A phase is done **iff**:

- [ ] `rm -rf dist && bun run check` (`fmt:check + lint + typecheck (both) + test --coverage`) green on CI image (Node 20, `bun` runtime). No `any`, no swallow `catch{}`, no inline style.
- [ ] Every new/modified `*.service.ts` / `*.pure.ts` / `*.hook.ts` has a `*.test.ts` beside it (`testPresence`).
- [ ] `purity` + `moduleBoundaries` + `fileKinds` pass on `vault-viewer/` globs.
- [ ] Playwright MCP suite for that phase green (screenshots + functional), pasted into the PR (headed run, 1280×800, dark+light).
- [ ] Visual diff vs Phase 0 baseline ≤50px (or justified and reviewer-approved).
- [ ] No behavior regressed vs `vault-viewer/README.md` API + FR-1..12 (phase-relevant subset).

End of Phase 5 is done **iff** all phases done + bundle report <170 kB gz + docs (`README.md` Architecture + `docs/architecture.md` + this `requirements.md`) updated.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| **Visual drift while extracting CSS classes** | Inline → class is line-for-line same declarations; capture baseline in Phase 0 before touching styles; after each `ui/` commit, MCP screenshot diff gates. |
| **`process.env.HOME` trap** (Bun caches `homedir` at startup) | Never mutate `process.env.HOME` in tests — inject `FsGateway`/`Env` via `container.ts`; `MemoryFs` in `supertest`. Spawned subprocess only if real HOME needed. |
| **`Stdio` `process.exit()` killing `bun test`** | Never construct real `Container` in-process for `InstallCommand`-like classes; use fake container or `spawn` (known trap from `CLAUDE.md`). |
| **FTS5 IDF collapse on tiny corpus** | Do not lower score floor — expected behavior on `seed-vault` (6 notes); golden search tests pin `title×10 tags×5 body×1 relPath×2` with empty vs filtered semantics. |
| **Barrel runtime cycles / `import { type X }` vs `import type`** | `verbatimModuleSyntax` on, barrels only `src/shared/contracts/index.ts` re-exports; `import type` for types. `moduleBoundaries` catches cycles. |
| **Playwright not installed in environment** | Phase blocks until `npx playwright install --with-deps chromium` + `bun` run via MCP. Never skip the verification. |

---

## 9. Deliverables & locations

- `vault-viewer/docs/architecture.md` — target structure (this repo, already saved).
- `vault-viewer/docs/requirements.md` — this file (strict requirements + plan).
- `tests/e2e/phase*.spec.ts` + `tests/e2e/__screenshots__/` — Playwright suites + baselines.
- `src/quality/*` (copied/adapted from `src/quality/*`) — purity/boundaries/kinds/presence.
- `src/shared/contracts/**` — Zod SSO.
- `src/server/**` — new Express MVC (per §4).
- `src/client/**` — new React 2026 modular frontend (per §4).

---

## 10. Immediate next step — awaiting approval

**Do not start Phase 0 implementation until this `requirements.md` is approved.**

Reply with `approve` (or annotate changes — e.g. "keep `pages/` not `modules/`", "allow `pnpm`", "change tolerance to 100px"). On approval, execution proceeds strictly in order **Phase 0 → 1 → 2 → 3 → 4 → 5**, each phase ending with the Playwright MCP verification listed in §6 before the next begins. The implementation runs **until done** (all exit criteria in §7 pass) with no further interruptions except review of each phase's screenshots.

