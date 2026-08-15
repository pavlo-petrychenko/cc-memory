# quality

Tests that assert on the repo's own shape rather than on any one file's behavior.
They turn the conventions in the root `CLAUDE.md` into gates.

- `purity.test.ts` — only role-suffixed files reference `gateways/` or a
  `node:`/`bun:` builtin. `cli/main.ts` is the one composition-root exception.
- `moduleBoundaries.test.ts` — a cross-module import names the target's
  `index.ts` (declarations excepted); nothing but a test reaches into
  `testing/`; no cycles between modules.
- `fileKinds.test.ts` — typedefs/constants hold no behavior; every production
  file carries a role suffix; every module root has an `index.ts`, nowhere below.
- `testPresence.test.ts` — every implementation file has a test beside it.
- `docs.test.ts` — one `CLAUDE.md` per module root, H1 = its own path, ≤20 lines.

Each test asserts its input set is non-empty first. This module has no
production code and is excluded from coverage.
