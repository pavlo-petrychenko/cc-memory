# worklogFloor

The `SessionEnd` hook: appends a deterministic, zero-token git/command
skeleton (branch, diffstat, recent commits) to today's worklog journal, so
even a killed session leaves a record. Write-only — it never produces stdout,
and a write failure is swallowed as best-effort.
