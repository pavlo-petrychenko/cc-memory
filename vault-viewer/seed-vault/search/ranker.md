---
type: note
importance: 6
tags: [search, ranking]
epic: search-v2
---
# Search Ranker

Implements BM25 with weights title×10 tags×5 body×1 and RRF k=60.

Uses [[jwt]] for auth check.

- depends_on [[jwt]]
