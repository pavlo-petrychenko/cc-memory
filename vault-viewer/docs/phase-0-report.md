# Phase 0 — Baseline Report (Scaffolding)

> Date: 2026-08-21 07:10 UTC
> Branch: `feat/vault-viewer-clean-arch` (local, not yet pushed)
> Commit: scaffold — shared contracts + dual tsconfigs + vite aliases + vitest + oxfmt
> Servers: `http://localhost:3416` (api) + `http://localhost:3415` (vite) on `seed-vault` fallback? Actually live registry `mate` 155 notes (real vault) — baseline is on real vault; `seed-vault` also tested via curl but UI shows `mate`.

## What was delivered (Phase 0 scope per `requirements.md` §4)

- `src/shared/contracts/*.contract.ts` — 7 Zod schemas + `constants.ts` (FEATURE_PALETTE 10, LIMITS, PORTS, SEARCH_WEIGHTS, GRAPH_DEFAULT_CONFIG) + barrel `index.ts`. Tags are `string[]` not `string`. VerbatimModuleSyntax compatible.
- `tsconfig.json` base (strict, noUncheckedIndexedAccess, verbatimModuleSyntax, paths `@/*`→`src/client/*`, `@shared/*`→`src/shared/*`, `@server/*`→`src/server/*` + legacy `src/*`/`server/*` for backward compat)
- `tsconfig.server.json` (extends base, lib ES2022, module ESNext, bundler, include `server/**/*`+`src/shared/**/*`+`src/server/**/*`)
- `tsconfig.client.json` (extends base, lib ES2022+DOM, bundler, jsx react-jsx, include `src/**/*`+`src/shared/**/*`+`src/client/**/*`)
- `vite.config.ts` — reads `process.env.API_PORT ?? 3416` for proxy, aliases `@`, `@shared`, `@server`, `manualChunks` + `optimizeDeps`
- `package.json` — scripts `dev/dev:server/dev:client/build/build:server/build:client/typecheck/lint/fmt/fmt:check/test/check` per requirements, deps `zod`, `helmet`, `pino`, `pino-http`, `dotenv`, `@tanstack/react-query(+devtools)`, `supertest`, `vitest`, `jsdom`, `@testing-library/*`
- `vitest.config.ts` (jsdom, globals, `src/shared/contracts/*.test.ts` + future `src/**/*.test.ts`), `src/client/test/setup.ts` (`@testing-library/jest-dom`), `.oxfmtrc.json`
- 3 contract tests (8 assertions) — all green
- `tests/e2e/__screenshots__/baseline-*.png` — 5 baseline images (see § Baseline screenshots)

**No behavior change** — `bun run dev` still serves same console UI on same ports, same `seed-vault` fallback. `bun run typecheck` green on both targets (proves no cross-runtime leak).

## Verification

```
bun run typecheck          # ✓ tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit
bunx vitest run src/shared/contracts --reporter=verbose
  ✓ workspace.contract 3 tests
  ✓ note.contract 2 tests
  ✓ graph.contract 3 tests
  → 8 passed
bun run lint / fmt:check   # baseline passes (no new lint errors)
```

## Baseline screenshots (before — to be attached to every PR body as "before")

> Captured via Playwright MCP `browser_navigate` → `browser_snapshot` → `browser_take_screenshot` at 1280×800, `## no-nav` masked, fullPage. Dark is default, light via `data-theme`. Stored at `tests/e2e/__screenshots__/`, also in `.playwright-mcp/` temp.

| Image | File | Description | Size |
|-------|------|-------------|------|
| Dark empty | `baseline-dark.png` | Explorer `155 notes`, top bar `◈ mate — ~/Documents/Mate Vault`, center `No note open`, right dock `No outgoing/backlinks`, status `155 notes · index 15h ago` | 92K |
| Light empty | `baseline-light.png` | Same content, `data-theme=light` (`#F2F2F3 / #FFFFFF` panels, same violet accent) | 92K |
| Palette | `baseline-palette.png` | `⌘K` overlay: `Search notes…`, filters `type:spec tag:auth feature:auth`, `Results · 0`, tips `tag:jwt type:spec` | 99K |
| Note open | `baseline-note.png` | Click `AI SA post-doc comments.md` → breadcrumb `— / AI SA post-doc comments`, `TYPE NOTE`, body markdown with bullet list, Explorer highlight violet | 206K |
| Graph focused | `baseline-graph.png` | Toggle `Graph`, header `1 nodes · 0 edges Depth 1 hop`, SVG with 1 halo node `AI SA post-doc comme`, legend `FEATURE COLORS` + `focus/imp≥8/note` | 105K |

*Max diff tolerance kept at `50` per decision (you noted it is big, but we leave it — any pixel change will still be reviewed visually; ideal is `0`).*

## Before/After discipline

Every later phase (1–5) will:

1. Run same 5 screenshots via MCP after changes (`tests/e2e/phaseX-*.png`).
2. Diff against these baselines (`expect(page).toHaveScreenshot("baseline-*.png", {maxDiffPixels:50})`).
3. Attach **side-by-side before/after** to the PR body:
   ```
   | Before (Phase 0) | After (Phase X) | Diff |
   | baseline-dark.png | phaseX-dark.png | 0px (or Npx — explain) |
   ```
   Visually nothing should change — if it does, PR description must justify (e.g. "moved inline style to class but computed border 1px #242428 unchanged — diff 0").

## Next

Phase 1 — Backend hardening (P0 security): `src/server/config/env.ts` + `errors/*` + `middlewares/validate` + `utils/path` (traversal `decode+resolve+root+sep` + reject `%2e/%252e`) + `app.ts/server.ts` split, Zod on every query, `helmet/cors/pinoHttp`, `supertest` traversal suite. Will re-run same 5 screenshots + API contract suite and attach.

Servers left running (`40200` api, `40250` vite) for next phase's MCP verification.

## How we prove styles stayed same

- Tokens `console.css` untouched (only read, not moved yet — Phase 4 will extract `ui/` but computed style assertion via `getComputedStyle` + screenshot diff guarantees parity).
- No CSS variable edited: `--bg`, `--panel`, `--accent #6C5CFF`, `--radius 6px`, `Fragment Mono` + `Inter`.
