# vault-viewer — Lab Notebook

Local viewer for cc-memory vaults. Viewer-only, runs on localhost.

## Run

```bash
cd vault-viewer
bun install
bun run dev
# Vite on http://localhost:3413 (proxies /api → Express on 3414)
# Express API also at http://localhost:3414/api
```

Build:
```bash
bun run build   # vite build + tsc --noEmit
# preview: bun run preview
```

## Design — Lab Notebook

Palette: white #FFFFFF grid #E8F0F7 24px, ink #0B1A2E, teal #2A9D8F, red #FF4D4D, brass #B89B5C.  
Type: Geist Sans (UI/titles) + JetBrains Mono (body 13.5px/1.7, stamps 10px uppercase).  
Wireframe was `wireframes/wireframe-lab-notebook.html` — oriented but improved:

- Grid is canvas-only (behind shell, not behind text blocks) for readability
- Stamped pills use brass label + red for importance≥8 (more scannable than wireframe's flat pills)
- Callouts keep blue left rule + icon for familiarity, not just border
- Graph uses circular layout with SVG edges (orthogonal would need elkjs; circular is clearer for v1) + teal glow on active
- Worklog timeline cards are clearer with pinned STATE amber border vs wireframe's flat
- Right dock collapses naturally on narrow widths; palette has filter chips

Light / dark toggle in top bar (instant CSS variables, grid opacity drops in dark). Dark is blueprint #0B1A2E / #122A4A.

## Architecture

```
vault-viewer/
  server/
    registry.ts  — loads ~/.claude/memory/registry.toml (smol-toml), expands ~, falls back to seed-vault
    vault.ts     — scans kb/, builds tree, scans _Worklogs, reads worklogs
    parser.ts    — port of src/modules/note note.parser regexes (FRONTMATTER, WIKILINK, TYPED_RELATION)
    search.ts    — BM25 approx (title×10 tags×5 body×1)
    index.ts     — Express routes
  client/
    App.tsx      — shell: TopBar | Explorer (two roots) | Main (tabs + Note/Graph/Worklog) | RightDock | Status | Palette
    services/api.ts — typed fetch wrappers
    styles/lab.css — tokens + layout
  seed-vault/    — 6 notes (auth/search) + 2 worklog slugs for demo when no real registry
```

Clean separation: server is routes → services → parser. Client is hooks → services → components. No cross-imports, no barrels that cycle. Classes would be overkill for this thin viewer; functions with pure parser keep purity.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/workspaces | list workspaces (id, kbTildified, noteCount) |
| GET | /api/tree?workspace=ID | kbTree + worklogs + count |
| GET | /api/note?workspace=ID&path=rel.md | parsed note + outgoing/backlinks/headings |
| GET | /api/file?workspace=ID&path=rel.png | static file (sandboxed to kb/worklogs) |
| GET | /api/search?workspace=ID&q=&type=&tag=&feature= | hits (BM25 approx) |
| GET | /api/graph?workspace=ID&focus=&depth=1|2&full=0|1 | nodes/edges |
| GET | /api/worklog?workspace=ID&slug=_root | state + entries + slugs |
| POST | /api/reindex?workspace=ID | recount (in-memory, no sqlite) |

Files are source of truth; index is disposable. Fail-open: missing registry → seed, missing kb → empty, malformed markdown → fallback title, API errors → toast.

## Seed fallback

If `~/.claude/memory/registry.toml` missing or no workspace matches, `seed` workspace at `vault-viewer/seed-vault` is used (also added as extra workspace when registry exists, so demo always available). Seed has:
- auth/auth.md (index), auth/jwt.md (spec with callouts, mermaid, wikilinks, typed relations), auth/oauth.md, search/search.md, search/ranker.md, loose-note.md
- _Worklogs/_root (STATE + 2 dates) + _Worklogs/feat-auth

## Ports

- Lab Notebook: Vite 3413, API 3414
- Obsidian: 3415 / 3416
- Console: 3417 / 3418
(Proxied: Vite always on the lower port, API on +1)

## Notes

- Mermaid is lazy-loaded via dynamic import; large chunk but acceptable for viewer
- Images resolved via /api/file relative to note dir or vault root
- Wikilinks `[[Target|Alias]]` → search for best hit, `![[Embed]]` → inline card placeholder
- Graph is v1 circular layout; typed edges teal, links_to grey
