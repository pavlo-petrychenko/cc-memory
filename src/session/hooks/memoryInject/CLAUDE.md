# memoryInject

The `UserPromptSubmit` hook: auto-retrieves relevant memory for the prompt via
a fused BM25 search over notes and worklogs, gated by prompt length, salient
token count, and a score floor.

Every call that clears the length/token gates writes the full candidate pool
to `inject.jsonl` (one file per workspace, beside its index db) — even one
that ends up injecting nothing — BEFORE the emptiness check, and the log is
size-capped with a keep-2 rotation so it never grows unbounded. Set
`CCMEM_INJECT_LOG=0` to disable the log entirely.
