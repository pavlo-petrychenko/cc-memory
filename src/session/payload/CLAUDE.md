# payload

Parses untrusted hook stdin JSON into the 5 typed per-event payload shapes
(`SessionStartPayload`, `MemoryInjectPayload`, `WrapGatePayload`,
`WorklogFloorPayload`, `CompactCheckpointPayload`).

`parseTolerantJson` never throws: empty input, invalid JSON, and JSON that
parses to something other than an object all fold to `{}`. Each `parse*Payload`
function then reads its own fields out of that record just as tolerantly — a
field present with the wrong JSON type reads as absent, never as a thrown
error. This is what lets every hook stay fail-open even on garbage stdin.

`JsonValue`/`JsonRecord` are the general boundary-decoding shape this parsing
is built on; other files in this module reuse them for their own untrusted
JSON (e.g. the wrap-gate state file), not only for hook stdin.
