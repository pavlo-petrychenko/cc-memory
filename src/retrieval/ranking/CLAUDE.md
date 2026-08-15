# ranking

Reciprocal Rank Fusion and the injection score floor — pure scoring math over
already-fetched `Hit`s, no database.

`fuse` combines a token-OR ranking with a phrase/`NEAR` ranking plus a
wikilink-corroboration bonus. `applyScoreFloor` filters hits by raw BM25
strength. Together with `query/`, this is the retrieval math that needs no
database.
