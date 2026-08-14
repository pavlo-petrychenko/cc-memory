# graph

Wikilink graph queries over the `links` table: `neighbors` (1-hop targets of
one note) and `inlinkCounts` (in-degree within a candidate set, feeding
`store/search/`'s RRF corroboration bonus).

A wikilink `dst` resolves to a candidate by relpath-minus-`.md` first, then
by basename; self-links are never counted.
