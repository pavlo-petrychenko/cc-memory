# cc-memory — Console Viewer

Local viewer for cc-memory vaults — **Console** variant (terminal native, Fragment Mono, violet #6C5CFF).

- **Viewer-only** — no editing. Files are source of truth.
- **Design**: Console — dense mono, #0A0A0B bg / #111113 panels, violet accent, line-numbers gutter, bloom graph. Light theme #F2F2F3 with same violet (toggle in top bar + rail).
- Improves on wireframe `wireframes/wireframe-console.html` with: real vault data (or seed), resizable rail, proper callout/mermaid handling, focused → full graph, worklog timeline with pinned STATE.

## Run

```bash
cd vault-viewer
bun install
# two terminals or one:
bun run server   # → http://localhost:3416  (Express API)
bun run client   # → http://localhost:3415  (Vite, proxies /api → 3416)
# or single:
bun run dev      # runs both concurrently (needs concurrently)
```

Build:
```bash
bun run build   # vite build + tsc --noEmit (both pass)
```

## API (Express 3416, also proxied via 3415/api)

- `GET /api/workspaces` → workspaces from `~/.claude/memory/registry.toml` or seed fallback (`seed-vault/` with 6 notes + 2 worklog slugs)
- `GET /api/tree?workspace=ID` → {kbTree, worklogs, notes}
- `GET /api/note?workspace=ID&path=rel.md` → parsed note + backlinks/outgoing
- `GET /api/file?workspace=ID&path=rel.png` → static file (sandboxed to kb/worklogs)
- `GET /api/search?workspace=ID&q=...&type=&tag=&feature=` → BM25-ish (title×10 tags×5 body×1)
- `GET /api/graph?workspace=ID&focus=path&depth=1&full=0` → focused (BFS 1-2 hops) or full (≤500)
- `GET /api/worklog?workspace=ID&slug=_root` → {stateBody, entries}
- `POST /api/reindex?workspace=ID` → rescans FS

Fail-open: missing registry → seed vault; missing kb/worklogs → empty; malformed markdown → still renders; no traversal outside vault.

## Architecture

```
vault-viewer/
  server/  parser.ts (regex port from src/modules/note), vault.ts (walkKb/buildKbTree/scanWorklogs/search), registry.ts (toml), index.ts (Express)
  src/     App.tsx (shell: rail + left Explorer + center Main/Tabs/Graph/Worklog + right Backlinks/Outline + status), components/{Explorer,Markdown,GraphView}, services/api.ts, types.ts, styles/console.css
  seed-vault/  auth/*, search/*, _Worklogs/*
```

Clean-ish separation: server services are pure-ish; frontend uses hooks + api service + typed props. No cyclic barrels.

## Where we diverged from wireframe

- Wireframe was static single-view; app adds real search palette (⌘K), IDE tabs (persisted per workspace), resizable sidebars, light/dark toggle (instant CSS vars), and proper fail-open.
- Kept console identity but softened: added Inter for titles, kept Fragment Mono for body/code to stay readable at 12.5px, line-numbers only in note view.
- **Graph — now Obsidian-like force graph via `d3-force`:**
  - Uses `d3` (forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX/Y) instead of static circular layout.
  - Each root folder (feature) gets same color from 10-color palette `#6C5CFF #2A9D8F #E6A03F #FF4D4D #3B82F6 #A3FFB5 #F97316 #8B5CF6 #06B6D4 #84CC16` — ordered alphabetically, consistent across sessions — loose notes muted `#7A7A85`. Legend shows feature→color.
  - Attraction: same-feature nodes cluster via forceX/Y toward feature centers (ring layout) + links within same feature use shorter distance (`linkDistance*0.62`) and stronger strength (`linkStrength*1.45`); linked nodes in general use `forceLink` strength `linkStrength`, so linked + same-feature attract strongest, like Obsidian.
  - Interaction: drag nodes to pin (`fx/fy` fixed, amber dashed ring, dbl-click to unpin), scroll to zoom (0.18–5×), drag background to pan, dbl-click background to reset zoom. Nodes: focus large (13px + halo + white stroke), imp≥8 phosphor glow, loose smaller.
  - Config: ⚙ Config panel with 6 live sliders (Link distance 24–160, Link strength 0.05–1, Repulsion −420–−20, Collision 2–22, Cluster 0–0.5, Center gravity 0–0.4) persisted in `localStorage:consoleGraphConfig` + Reset defaults. All forces update live without reload.

## Ports

- Console → **3415** (Vite) / 3416 (API) — do not clash with Lab (3413) / Obsidian (3414) variants.
