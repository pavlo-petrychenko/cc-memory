---
name: memory-search
description: >-
  Search the current workspace's knowledge base (and worklogs) fast, via the local
  BM25 index. Use this as the FIRST way to find durable knowledge — what do we know
  about X, where is Y documented, has this been solved before — instead of the
  obsidian MCP's weaker search or broad file greps. Returns ranked note paths +
  snippets scoped to THIS workspace only; then open the top hits for full content.
---

# memory-search

Backed by the per-workspace SQLite FTS5 index (`memory.db`) that the SessionStart
hook keeps fresh. BM25 ranking — strong on exact identifiers (function names,
flags, table names, error strings), which is what code questions hinge on. Results
are isolated to the current workspace (resolved from cwd).

## Use it

```
memory search "<query>"            # top KB notes for the cwd's workspace
memory search "<query>" -k 8       # more hits
memory search "<query>" --worklog  # search recent short-term worklogs instead
memory search "<query>" --workspace mate   # force a workspace
```
Output is `• <title> (relative/path.md)` + a snippet per hit.

## Workflow
1. Run `memory search "<salient terms>"` — prefer exact identifiers/nouns over
   prose (e.g. `salesQa overall_score prompt_version`, not "how scoring works").
2. Open the top 1–3 hits (Read the file, or the `obsidian` MCP `read_note`) to get
   full content, then follow their `[[wikilinks]]`.
3. If nothing relevant returns, the KB likely doesn't cover it — say so rather than
   guessing; consider capturing it later via `save-learning`.

## Notes
- The UserPromptSubmit hook already auto-injects a few top hits for most prompts;
  use this skill when you need more results, a different query, or worklog search.
- Reindex is automatic on session start; force it with `memory reindex` if you just
  wrote notes and want them searchable immediately.
