# tokenizer

Turns arbitrary prompt/note text into the salient lowercased terms retrieval
matches on: `salientTokens` (a set, for the FTS OR query) and `orderedTerms`
(sequence-preserving, for NEAR phrase pairs).

Owns the camel/snake/digit splitting rules and the stopword list. Emits BOTH
the glued form and the split parts for a chunk like `overallScore`, so a
query in either style retrieves notes written in the other.
