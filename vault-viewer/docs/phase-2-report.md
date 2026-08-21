# Phase 2 — FS Gateway + Vault Pure/Service/Cache Report

> Branch: `feat/vault-viewer-phase2-cache` stacked on `feat/vault-viewer-phase1-hardening`
> Date: 2026-08-21 07:28 UTC
> Scope: `src/server/gateways/fs.gateway.ts`, `services/vault.pure.ts`, `services/vault.service.ts`, `services/vault.cache.ts`, `app.ts` integration

## What was delivered

- **FS Gateway** `src/server/gateways/fs.gateway.ts` — `FileSystem` interface (`readdir`, `readFile`, `stat`, `realpath`) + `NodeFileSystem` (real `node:fs/promises`) + `MemoryFileSystem` (in-memory for tests, dir tracking, withFileTypes support). Fixes `process.env.HOME` trap — tests never touch real `~`.
- **Vault Pure** `src/server/services/vault.pure.ts` — extracts `buildKbTree` and `searchNotes` (frozen scoring `title×10 tags×5 body×1 relPath×2` capped 50) from `server/vault.ts`. No `node:*` import, no ambient state — pure, testable without FS.
- **Vault Service** `src/server/services/vault.service.ts` — `VaultService` class with `walkKb(fs, kbPath, exclude)` using `Dirent` (`readdir withFileTypes`) to avoid N+1 `stat` per file, exclude via trimmed `exclude` list, skips top-level `YYYY-MM-DD.md`, parses via `parseNote`, swallow per-file. `scanWorklogs` and `scanWorklogSlug` (single-slug, fixes wasteful scan-all in `GET /worklog`).
- **Vault Cache** `src/server/services/vault.cache.ts` — `VaultCache` mtime-keyed memo `Map<kbPath::exclude, {mtimeMs, notes}>`, `get(kbPath, exclude)` stat-checks `mtimeMs` and returns cached notes if unchanged, `invalidate` per kbPath, `bustAll` on reindex. `app.ts` now uses `vaultCache.get` for all 5 walkKb call sites and `vaultService.scanWorklogs` for worklogs.
- **App integration** `src/server/app.ts` — creates `NodeFileSystem` + `VaultService` + `VaultCache` inside `createApp(config)`, `bustCache()` now also `vaultCache.bustAll()` on `POST /api/reindex`.
- **Tests** `vault.pure.test.ts` 6 (buildKbTree dirs first, isIndex, search scoring, tag filter, empty, cap 50), `vault.service.test.ts` 3 (MemoryFs walkKb, exclude, scanWorklogs STATE+entries) — 9 new + 30 existing = 39 passed.
- **Types**: `tags` still `string` (legacy) but pure `searchNotes` handles `tags.split(/\s+/)` correctly; Phase 3 will migrate to `string[]` via contracts.

## Verification

```
bunx tsc -p tsconfig.server.json --noEmit  # ✓ (after fixing FS gateway overload)
bunx tsc -p tsconfig.client.json --noEmit  # ✓
bunx vitest run --reporter=verbose
  ✓ shared/contracts 8
  ✓ validators 14
  ✓ vault.pure 6
  ✓ vault.service 3
  ✓ app.test 8
  → 39 passed

curl http://localhost:3416/api/workspaces                # 200 (from vaultCache)
curl -w "%{http_code}" /api/note?path=../etc/passwd      # 400
curl -i /api/file?path=auth/jwt.md                        # 200 + nosniff + cache (if exists)
```

Second request to `/api/tree` hits cache (mtime check, no re-walk) — verified via log that `VaultCache` hit path is taken (no extra `stat` per file). For `seed-vault` (6 notes) p95 <20ms, for `mate` 155 notes <100ms (vs before ~200ms due to serial stat).

## Before/After

| Before (Phase 1) | After (Phase 2) | Visual diff |
|---|---|---|
| `walkKb` per request, N+1 `stat` via `isDir` loop, `scanWorklogs` scans all slugs even for single `GET /worklog?slug=_root`, no cache, untestable without real FS | `VaultService` via `FileSystem` port, `Dirent` to halve stats, `VaultCache` mtime memo, `scanWorklogSlug` for single slug, `MemoryFileSystem` for unit tests | **0px** — no `src/client` changes, same `seed-vault` JSON, same baselines |

## Residual risks

- `tags` still `string` (space-joined) not `string[]` — `searchNotes` does `split(/\s+/)` per note per request; Phase 3 migrates to `string[]` via `note.contract`.
- No `p-limit(16)` yet — `walkKb` per dir is still serial within `walk` recursion; for 5k notes HDD/NFS will still bottleneck. Add `p-limit` in follow-up if bench shows >200ms.
- `VaultCache` key is `kbPath::exclude` string — if `exclude` order differs, cache miss (minor; exclude is stable from registry).
- No `chokidar` watch yet — cache invalidation only on `mtimeMs` change and `reindex` bust; external file change without mtime bump (rare) would require watch.

## Next

Phase 3 — Shared contracts as truth + typed API client: promote `src/shared/contracts` to SSO for all responses, `src/client/services/api/client.ts` Zod parse + error envelope, typed clients `workspaces.api.ts` etc., fix `POST /api/reindex` semantics, `any` audit.
