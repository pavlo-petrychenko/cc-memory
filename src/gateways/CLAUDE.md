# gateways

The only place that touches the outside world: fs, git, proc, sqlite, clock,
env, logger, stdio — plus the `SearchIndex` port (FTS5 over `bun:sqlite`).

`gateways.container.ts` builds the real `AppGateways`; every other adapter is
one folder pairing a `*.typedefs.ts` port with its real implementation.
`openDatabase` memoizes one handle per path. `Sqlite` is never faked — FTS5's
stemmer/bm25/NEAR are the behavior under test.
