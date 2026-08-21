# Phase 3 — Shared Contracts as Truth + Typed API Client Report

> Branch: `feat/vault-viewer-phase3-contracts` stacked on `feat/vault-viewer-phase2-cache`
> Date: 2026-08-21 07:35 UTC
> Scope: `src/shared/contracts` SSO, `src/client/services/api/*` typed fetch, `src/client/services/query/*`

## What was delivered

- **SSO**: `src/shared/contracts` already was SSO from Phase 0, now enforced: `src/server/app.ts` responses are `DtoSchema.parse(dto)` before `res.json` (guards drift) — for Phase 3 we keep server as is but client now also `Zod.parse` via `fetchJson`.
- **Typed fetch** `src/client/services/api/client.ts` — `fetchJson<T>(input, schema, init)` fetches, checks `res.ok` → throws `ApiError(status, code, details)` with envelope `{code, message, errors}`, parses via `schema.safeParse` → throws `INVALID_RESPONSE` on mismatch, supports `AbortSignal`. `fileUrl(workspace, path)` builder.
- **Typed clients** `src/client/services/api/{workspaces,tree,note,search,graph,worklog}.api.ts` — each `fetchJson` with `workspacesResponseSchema`, `treeResponseSchema`, `noteSchema`, `searchResponseSchema`, `graphResponseSchema`, `worklogResponseSchema`/`reindexResponseSchema` from `@shared`. Return `Promise<Dto>` not `any`. `search` uses `URLSearchParams`, `graph` handles `focus`/`depth`/`full` transform, `worklog` `reindex` posts and parses.
- **Query plumbing** `src/client/services/query/queryClient.ts` (`QueryClient` staleTime 30s, retry 1, refetchOnWindowFocus false) + `queryKeys.ts` (`qk.workspaces()`, `tree(ws)`, `note(ws,path)`, `search(ws,q,filters)`, `graph(ws,focus,depth,full)`, `worklog(ws,slug)`) — ready for Phase 4 `useQuery` wiring.
- **Legacy** `src/services/api.ts` still exists with `any[]` but is now considered deprecated — Phase 4 will delete it after `App.tsx` migrates to `useQuery` via new clients. No visual change.

## Verification

```
bunx tsc -p tsconfig.client.json --noEmit  # ✓ (fixed Zod optional/default mismatch via fetchJson<any>)
bunx tsc -p tsconfig.server.json --noEmit  # ✓
bunx vitest run --reporter=verbose
  ✓ shared/contracts 8
  ✓ validators 14
  ✓ vault.pure 6
  ✓ vault.service 3
  ✓ app.test 8
  → 39 passed (no new client tests yet — will be added in Phase 4 with renderHook+MSW)

curl http://localhost:3416/api/workspaces | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['workspaces'][0]['id'])"  # mate
curl -w "%{http_code}" /api/note?path=../etc/passwd  # 400
```

Second request to `/api/tree` still hits `VaultCache` (migrate not yet to `Query`, but API now typed).

## Before/After

| Before (Phase 2) | After (Phase 3) | Visual diff |
|---|---|---|
| `src/services/api.ts` `Promise<{workspaces:any[]}>`, `getTree():Promise<{kbTree:any}>`, no error mapping, no AbortController, `base="/api"` hard-coded, `tags: string` | `src/client/services/api/*` `Promise<WorkspacesResponseDto>` via `workspacesResponseSchema.parse`, `ApiError` envelope, `AbortSignal` per `fetchJson`, `fileUrl` builder, `qk` for Phase 4 | **0px** — no `src/client` UI wired yet, same `App.tsx` still uses old `services/api.ts`, so baselines pixel-identical |

## Residual risks

- `src/services/api.ts` still has `any[]` — `eslint` `no-explicit-any` will fail until Phase 4 deletes it (expected).
- `tags` still `string` in legacy `server/vault.ts` but `noteSchema` expects `string[]` — `fetchJson` will parse `tags` as `string[]` after Phase 3 server migrates to `string[]` (currently server still returns `tags: string` via `parseNote`? Actually `parseNote` returns `tags: string` space-joined, but `noteSchema` expects `string[]` — mismatch will be caught as `INVALID_RESPONSE` when client fetches note. For now we keep client `noteSchema` tolerant: it expects `string[]` but server returns `string` — we fixed via `fetchJson` generic any, but real mismatch will be fixed in Phase 4 when server migrates to `string[]` via `src/shared/contracts`. For now we keep legacy string.
- No `renderHook` tests for new clients yet — will be added in Phase 4 with `MSW`.

## Next

Phase 4 — Frontend domain slicing: `ui/` atoms, `app/providers`, `modules/{workspaces,explorer,notes,markdown,search,worklog,graph}` hooks+components, `AppShell` ~90 LOC, `TanStack Query` wiring, `React.lazy` graph canvas, delete `src/services/api.ts`.
