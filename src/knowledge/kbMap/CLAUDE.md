# kbMap/

Builds the KB map injected at SessionStart: `kbMap.service.ts` scans a
workspace's vault top level (feature directories, each with an optional
`<name>/<name>.md` index note, plus loose top-level notes) into a
`KbMapInput`; `kbMap.formatter.ts` renders that into the agent-visible text.

A missing vault directory is a filesystem concern, so the service returns
`null` rather than the formatter emitting an empty-vault message — the
caller decides what "no map at all" means.
