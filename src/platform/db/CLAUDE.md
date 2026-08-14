# db

The `SqlDatabase` port: one `bun:sqlite` handle per process, with a
prepared-statement cache keyed by the SQL string itself. Safe because every
SQL string this project runs is a literal constant, never built by
concatenating untrusted input.

**Never faked.** FTS5's porter stemmer, `bm25()` weighting and `NEAR`
semantics are the behavior under test, so every test that needs a
`SqlDatabase` opens a real `:memory:` database via `makeDatabaseAdapter`
instead of a fake — including the FTS5 capability smoke test in this
folder's test file.

`getUserVersion`/`setUserVersion` wrap `PRAGMA user_version`, the schema
version check that decides whether the index needs a full rebuild.
