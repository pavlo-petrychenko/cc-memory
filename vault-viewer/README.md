# vault-viewer — Obsidian Native (port 3414)

Local viewer for cc-memory vaults. Faithful Obsidian clone, viewer-only, light/dark.

## Run

```bash
cd vault-viewer
bun install
bun run dev        # Vite on :3414 → proxy /api → Express on :3415
# or
bun run dev:server # Express alone on :3415
bun run dev:client # Vite alone on :3414
```

Open http://localhost:3414 — picks workspaces from `~/.claude/memory/registry.toml` (falls back to `seed-vault/` if no registry, so demo always works). Workspace switcher preserves tabs per workspace in localStorage.

Production:

```bash
bun run build:client   # vite build → client/dist
PORT=3414 bun server/src/index.ts  # serves API + dist
```

## API (Express /api, port 3415 in dev)

- `GET /api/workspaces` → `[{id, kb, worklogs, noteCount, indexFresh, kbAbs, worklogsAbs, match}]`
- `GET /api/tree?workspace=ID` → `{kbTree, worklogsTree}` — kbTree is nested TreeNode[] (dirs-first), worklogsTree is `[{slug, state, entries}]`
- `GET /api/note?workspace=ID&path=rel/path.md` → `{title, type, importance, tags, epic, body, rawText, rels, backlinks, outgoing}`
- `GET /api/file?workspace=ID&path=rel.png` → static file (sandboxed to kb/worklogs; MIME for png/jpg/svg/pdf)
- `GET /api/search?workspace=ID&q=...&type=&tag=&feature=` → hits `[{path, title, type, snippet, score}]` — BM25-ish: title×10 tags×5 body×1
- `GET /api/graph?workspace=ID&focus=...&depth=1|2&full=0|1` → `{nodes, edges}` — nodes=`{id,title,type,tags}`, edges=`{from,to,type}`; focused = BFS hop, full capped at 500
- `GET /api/worklog?workspace=ID&slug=_root` → `{slug, stateBody, statePath, entries:[{date,body,path}]}`
- `POST /api/reindex?workspace=ID` → `{added,updated,removed,total}` (rescan, no real index)
- `GET /health` → `{ok:true}`

Search is in-memory scan (no SQLite) approximating BM25 weights; index is disposable. FS watching via chokidar logs changes; client re-fetches on interaction (poll-free). All routes fail-open (404/empty on missing).

## Vault mapping

- Registry at `~/.claude/memory/registry.toml` (also `CCMEM_*` env). Paths with `~` expanded.
- KB: `kb/` — top-level dirs = features, `Feature/Feature.md` is index, loose `*.md` at root (excluding `YYYY-MM-DD.md`), exclude + dotfiles hidden.
- Worklogs: `worklogs/{slug}/STATE.md` + `YYYY-MM-DD.md`
- Parser regexes ported from `src/modules/note/note.constants.ts`: `FRONTMATTER`, `WIKILINK`, `TYPED`, `INLINE_TAG`, `TITLE`. Tags = frontmatter tags + inline #tags; rels = typed + links_to.

## UI — Obsidian Native

- **Layout:** Ribbon (44px) | Left 280px | Main (tabs 37px + centered 700px) | Right 300px | Status 22px (accent #7C3AED)
- **Palette:** dark bg #1E1E1E sidebar #161616 hover #262626 border #2E2E2E text #DCDDDE muted #888 accent #7C3AED/#8B5CF6; light bg #FFFFFF sidebar #F5F5F5 border #E9E9E9 text #2E3338 same accent. Inter + JetBrains Mono, 4px radius, purple top border on active tab, purple wikilinks, Properties table.
- **Explorer:** two roots in one tree (KB + WORKLOGS), collapsible, active left accent, counts, respects exclude.
- **Search:** top input + ⌘K palette (center modal, debounced 150ms), filter chips type/tag, snippet highlights.
- **Tabs:** IDE-style, per-workspace localStorage `tabs:{id}`, Cmd/Ctrl+Click → new tab, active purple border.
- **Note:** breadcrumbs, Properties card (type/importance/tags/epic pills), rendered markdown: headings, bold/italic, lists/checkboxes, code blocks, tables, callouts `> [!NOTE]`, wikilinks (resolved purple, unresolved dashed), embeds `![[ ] ]` as cards, images via `/api/file`, mermaid as code embed.
- **Graph:** full-bleed, force-free radial layout, click node → open tab + refocus, Depth 1/2 toggle, Full/Focused toggle, edge style by relationType (solid vs dashed).
- **Worklog:** slug switcher, pinned STATE.md (amber left rule), entries newest-first as cards, date jump.
- **Right dock:** Backlinks (with snippet), Outgoing, Outline (headings), Tags — contextual.
- **Theme:** toggle in ribbon (☀/◐), persisted in localStorage, data-theme attribute.

## Where we diverged from wireframe (`wireframes/wireframe-obsidian.html`)

- Wireframe was static single view; implemented full interactive app with real vault data, live search, graph physics, worklog timeline, and palette. Improved spacing (700px measure vs full-width), added filter chips and graph controls that wireframe hinted but didn't specify, made embeds/callos render faithfully, and added light theme (wireframe showed dark only). Kept identity: purple accent, ribbon, properties, stacked tabs.

## Architecture

```
vault-viewer/
  server/src/
    index.ts          — Express + static
    routes/api.ts     — all /api handlers
    services/registry.service.ts, vault.service.ts, noteParser.ts
    types.ts
  client/
    vite.config.ts — root=client, proxy /api→:3415, port 3414
    index.html
    src/
      main.tsx, App.tsx (single-file composition for v1)
      services/api.ts, hooks/useLocalTabs.ts, styles/obsidian.css
  seed-vault/ — fallback demo when no registry
```

Clean-ish separation: server services are pure-ish (no Express in parser), client hooks/services isolated. No barrels that cycle.

## Seed vault

If `~/.claude/memory/registry.toml` missing, viewer shows `seed-vault/` (auth/jwt, auth/oauth, search/ranker, loose-note + _Worklogs/_root with 2 dates) so `bun run dev` works on any machine/CI.

## Known limits

- Search is substring BM25, not FTS5 porter; no stemming, no RRF.
- Graph layout is radial, not force-directed; full vault capped 500 nodes.
- Images served via /api/file; PDF not previewed, just download.
- No file watch push — client re-fetches on nav/search; chokidar logs only.
