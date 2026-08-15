# connection

Opens one workspace's index database: `openIndexDb` ensures the parent
directory exists, applies the current `schema/` DDL, and triggers a one-time
full rebuild whenever the stored `PRAGMA user_version` is behind
`SCHEMA_VERSION`.

One handle per process per path (`Container.openDatabase`'s own memoization)
— every other `store/*` submodule opens the index through this, never the
container directly.
