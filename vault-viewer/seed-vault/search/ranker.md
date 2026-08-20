---
type: spec
importance: 6
tags: [search, ranking]
---

# Search Ranker

Implements BM25 weights title×10 tags×5 body×1 and RRF k=60.

See [[JWT Handling]] for auth before search.

- links_to [[search]]

```js
score = 10*titleMatch + 5*tagMatch + 1*bodyMatch
```

#search
