# wrapGate

The `Stop` hook: nudges (non-blocking) on the first stop(s) with uncommitted
work, escalating to a hard block only after repeated stops with sustained
drift. State lives in one `wrap-state.json` per workspace, keyed by session
id and pruned of entries older than 7 days on every write — a shared,
self-pruning file instead of one marker file per session.

`WrapGateInput` is the pure `(slug, dirtyCount) => string` shape the
formatter renders; deciding nudge vs. block is the hook's own stateful call,
not the formatter's.
