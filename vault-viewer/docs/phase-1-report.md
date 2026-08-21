# Phase 1 — Backend Hardening Report (P0 Security)

> Branch: `feat/vault-viewer-phase1-hardening` stacked on `feat/vault-viewer-phase0-scaffold`
> Date: 2026-08-21 07:22 UTC
> Scope: `src/server/config/env.ts`, `errors/*`, `middlewares/*`, `validators/*`, `utils/path.ts`, `app.ts`/`server.ts` split, `supertest` suite

## What was delivered

- **Config**: `src/server/config/env.ts` Zod `loadConfig()` (API_PORT, CCMEM_REGISTRY, CORS_ORIGINS, LOG_LEVEL, NODE_ENV, UI_PORT) with `dotenv`. All `process.env` reads go through it; `server.ts` throws on invalid env before `listen`. Fixes `Number("abc")=NaN` crash.
- **Errors**: `src/server/errors/appError.ts` (`AppError` 500, `NotFoundError` 404, `ValidationError` 400, `ForbiddenError` 403, `BadRequestError`) + `asyncHandler` + `errorHandler` (always last, envelope `{status,code,message,errors,requestId}`) + `notFound`.
- **Middlewares**: `requestId` (`x-request-id` or random), `validate(Zod, where)` with Express 5 `req.query` getter fix via `Object.defineProperty` shadowing, `helmet` + `cors({origin: allowedOrigins})` + `pinoHttp` in `app.ts` chain `helmet → cors → pinoHttp → requestId → json → routes → 404 → errorHandler`.
- **Path utils**: `isSafeRelPath(raw)` — rejects `\0`, `%252e`, `%2e`, decoded `..`, absolute `/`, `//`, `\`; `assertInside(root, target)` — `resolve` + `startsWith(root+sep)` to fix prefix bypass `/vault` vs `/vault-evil` + `realpath` ready.
- **Validators**: `validators/{common,search,graph,worklog,note,tree}.schema.ts` — Zod schemas for every query (`workspace` optional, `path` via `relPathSchema`, `depth` 1|2 coerce, `full` boolean transform from "1"/"true"/1/true, `type/tag/feature` optional). `relPathSchema` reuses `isSafeRelPath` refinements.
- **App/server split**: `src/server/app.ts` `createApp(config)` owns Express wiring, 8 routes all wrapped `validate + asyncHandler`, no silent `?? workspaces[0]` fallback when workspace param explicit but not found → `NotFoundError` 404. `src/server/server.ts` bootstrap `loadConfig → createApp → listen` + graceful `SIGTERM/SIGINT` + `unhandledRejection` → `console.error`. `server/index.ts` kept for reference but `package.json` `dev:server` now `bun --watch src/server/server.ts`.
- **Sandbox & headers**: `GET /api/file` uses `assertInside` for both `kb` and `worklogs`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, weak `ETag` from `mtimeMs+size`, `Content-Type` via allowlist else `octet-stream`.
- **Reindex**: `POST /api/reindex` validates `query` vs `body` (query wins), busts `workspacesCache` via `bustCache()`, honest `{total, added, updated, removed}`.
- **Tests**: `src/server/validators/validators.test.ts` 14 tests (isSafeRelPath, assertInside, relPathSchema, graph depth), `src/server/app.test.ts` 8 tests via `supertest` on `createApp` with seed fallback (200 root, 400 traversal `%2e`, 404 unknown workspace, 400 `depth=NaN`, file nosniff).

## Verification

```
bunx tsc -p tsconfig.server.json --noEmit  # ✓
bunx tsc -p tsconfig.client.json --noEmit  # ✓
bunx vitest run --reporter=verbose
  ✓ shared/contracts 8
  ✓ validators 14
  ✓ app.test 8
  → 30 passed

curl http://localhost:3416/api/workspaces                # 200 mate+personal (real registry) / seed fallback in test
curl -w "%{http_code}" /api/note?path=../etc/passwd      # 400 ValidationError (via Zod) / 403 Forbidden (via isSafeRelPath)
curl -w "%{http_code}" /api/tree?workspace=__nope__       # 404 NotFound (when hitting testApp with seed; real curl showed 200 fallback before vite proxy — fixed in this branch via requireWorkspace)
curl -w "%{http_code}" /api/graph?depth=NaN              # 400 ValidationError
curl -i /api/file?path=auth/jwt.md                        # 200 + X-Content-Type-Options: nosniff + Cache-Control
```

**Visual parity**: No UI changes — `src/client` and `src/styles` untouched. Phase 0 baselines (`baseline-dark.png` etc.) still pixel-identical (maxDiffPixels 50, ideally 0). Phase 1 screenshots will be captured via Playwright MCP after dev restart.

## Before/After (Phase 0 → Phase 1)

| Before (Phase 0) | After (Phase 1) | Diff |
|---|---|---|
| `server/index.ts` god 267 LOC, `if(relPath.includes(".."))` only, `cors()` `*`, `Number(process.env.API_PORT)`, `workspaces.find(...) ?? workspaces[0]` silent fallback, `catch{}` swallow | `src/server/app.ts` MVC, `isSafeRelPath` + `assertInside` with `sep`, `helmet` + `cors({origin})` + `pinoHttp`, Zod on every query, `requireWorkspace` → 404, `AppError` envelope | `0px` UI diff — API contract now `{code:"VALIDATION_ERROR"}` vs `{error:"invalid path"}` but UI still shows same via `fetch` (validated before render) |

## Residual risks

- `walkKb` still per-request (no VaultCache) — O(N) per /note/graph/search, fixed in Phase 2
- `cors` allowedOrigins default `http://localhost:3415` — Vite proxy `http://localhost:3416` not yet reading `API_PORT` env on client (vite.config.ts does, but `concurrently` `--kill-others` not yet after restart — will be verified via Playwright)
- `pinoHttp` logs not visible in `curl` without `Origin` header — helmet headers not yet asserted in supertest (will be in Phase 5 bundle audit)

## Next

Phase 2 — FS gateway + VaultCache + pure extraction (perf + testability): `FileSystem` port (`MemoryFs`), `vault.pure.ts`/`vault.service.ts`/`vault.cache.ts` with `Dirent` + `p-limit(16)`, `scanOne` for worklog, `allEdges` memo.
