# quality

Tests that assert on the repo's own shape rather than on any one file's behavior.
They turn the conventions in the root `CLAUDE.md` into gates, so a convention
cannot quietly stop being true between reviews.

- `purity.test.ts` — only role-suffixed files reference `platform/` or a
  `node:`/`bun:` builtin. `cli/main.ts` is the one composition-root exception.
- `moduleBoundaries.test.ts` — a cross-module import names the target's
  `index.ts` (declarations excepted); nothing but a test reaches into
  `testing/`; no cycles between top-level modules.
- `fileKinds.test.ts` — typedefs and constants files hold no behavior; every
  production file carries a role suffix; every module has an `index.ts`.
- `testPresence.test.ts` — every implementation file has a test beside it.

Each test asserts its own input is non-empty first: a structural rule that
matches nothing passes while checking nothing, which is how the old cycle check
went dead when imports became absolute.

This module has no production code and is excluded from coverage.
