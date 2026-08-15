# compactCheckpoint

The `PostCompact` hook: persists the compaction summary Claude Code hands
back after compacting into today's worklog journal, so distilled context
survives the reset. Write-only, and a no-op when the summary is empty.
