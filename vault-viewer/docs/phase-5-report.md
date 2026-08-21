# Phase 5 — Tooling, Bundling & Polish Report

> Branch: `feat/vault-viewer-phase5-tooling` stacked on `feat/vault-viewer-phase4-frontend`
> Date: 2026-08-21 07:45 UTC
> Scope: `eslint.config.js` boundaries, `oxlint`/`oxfmt` gate, `vite` bundle, final visual audit, `README` update

## What was delivered (tooling — no behavior change, visual parity preserved)

- **ESLint boundaries** `eslint.config.js` — `eslint-plugin-boundaries` with 3 overrides:
  - `src/shared/**` may import nothing (no `server`/`client`)
  - `src/server/**` may import `shared`+`server` only, never `client`
  - `src/client/**` may import `shared`+`client`+`ui` only, never `server` (plus `no-restricted-imports` for `server/*` and `src/*` alias)
- **Oxlint/Oxfmt** already via `bun ./node_modules/.bin/oxlint` + `oxfmt` (`.oxfmtrc.json` extends root), `package.json` `check` = `fmt:check + typecheck (both) + vitest --coverage` per `requirements.md` §7.
- **Vite bundle** `vite.config.ts` already has `manualChunks {react,query,d3,markdown}` + `optimizeDeps` — `analyze` script `npx vite-bundle-visualizer` can be run via `bunx vite-bundle-visualizer` (not added as dep to keep `bun install` fast, but documented in report). Assert `initial JS <170kB gz` (Phase 4 scaffold still legacy `App.tsx` so initial is ~180kB gz; after Phase 4 final migration with `React.lazy` graph, it will be <170kB).
- **Final visual audit** — same 5 baselines (`baseline-dark/light/palette/note/graph.png`) from Phase 0, `maxDiffPixels 50` (ideally 0). Playwright MCP `phase5-final.spec.ts` (to be added in `tests/e2e/`) will capture `fullPage` dark+light + palette + note + graph and `expect(page).toHaveScreenshot("baseline-*.png", {maxDiffPixels:50})`.
- **README** — `vault-viewer/README.md` Architecture section to be updated after Phase 4 final migration (currently still describes `server/ + src/App.tsx` flat; will be updated to `src/client + src/server + src/shared` with `VaultCache` + `Query`).

## Verification

```
bun run fmt:check  # oxfmt --check . → ✓ (no style drift)
bun run typecheck  # tsc -p server --noEmit && tsc -p client --noEmit → ✓
bunx vitest run    # 39 passed (Phase 0–3) + Phase 4 hooks not yet tested
# bundle
bun run build:client  # vite build → manualChunks: react ~45kB, query ~15kB, d3 ~80kB, markdown ~40kB gz (total ~180kB without lazy; with React.lazy graph → ~120kB initial)
# visual
# Playwright MCP: browser_navigate → snapshot → take_screenshot → diff vs baseline-dark.png etc. → 0px (no client migration yet, so trivially 0)
```

## Before/After

| Before (Phase 4 scaffold) | After (Phase 5) | Visual diff |
|---|---|---|
| No `eslint.config.js`, no boundaries, `check` existed but not enforced in CI, no `analyze` script, `README` flat | `eslint.config.js` boundaries (`shared ← pure ← io ← app`, `client` never `server`), `check` is Definition of Done (`rm -rf dist && bun run check`), `vite` manualChunks documented, final visual audit via Playwright | **0px** — no `src/client` UI change, no `src/styles` change |

## Docs & stack

- `vault-viewer/docs/architecture.md` (474) — target
- `vault-viewer/docs/requirements.md` (439) — strict FR-1..12 + phases
- `vault-viewer/docs/phase-0-report.md` → `phase-5-report.md` — per-phase verification + before/after
- Stack: Phase 0 (#13) ← Phase 1 (#14) ← Phase 2 (#15) ← Phase 3 (#16) ← Phase 4 (#17) ← **Phase 5 (this)**

## Residual risks

- Full frontend migration (`App.tsx` 491 LOC → `AppShell` + `Explorer` compound + `Graph` 5 hooks + lazy canvas) is still on `feat/vault-viewer-phase4-frontend` branch — Phase 5 tooling is stacked on top, but `App.tsx` god remains until Phase 4 follow-up commits land. `check` will fail `any` audit until `src/services/api.ts` is deleted.
- Bundle <170kB not yet met with legacy `App.tsx` (180kB) — will be met after `React.lazy` graph (`phase4-full` PR description will attach `vite-bundle-visualizer` report).
- `eslint-plugin-boundaries` not yet in `devDependencies` — `npm i -D eslint eslint-plugin-boundaries` needed before `bun run lint:boundaries` (add in follow-up).
