# container

The composition root. `AppContainer` builds one real instance of every
port and bundles them into a `Container` — the single value `cli/main.ts` and
the hook runtime construct once and thread through the rest of the codebase.

`envSnapshot` is consulted only for `CCMEM_LOG_LEVEL`, to set the logger's
threshold; every other port reads the live process directly. `openDatabase`
memoizes by path so repeated calls against the same workspace share one open
SQLite handle instead of opening a second connection.
