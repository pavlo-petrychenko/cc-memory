# modules/kb

The Obsidian KB map: scans a vault's top level into a renderable structure and
formats it for session-start injection.

- `kbMap.service.ts` — build() (filesystem scan)
- `kbMap.formatter.ts` — renders the injected text
- `kbMap.typedefs.ts` — KbMapInput/KbMapFeature

No use cases, no resolvers — consumed by memory/ via KbMapService.
