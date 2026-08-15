# modules/worklog

Short-term memory: `STATE.md` + dated journals under `<kb>/_Worklogs/<slug>/`,
plus the `commit` snapshot and the worklog index (`worklog_fts`/`worklog_files`).

`services/worklogStore` does the filesystem I/O; `projection/` reprojects and
searches the worklog index (bm25 3/1/1, contract C7); formatters render the two
frozen worklog formats and the agent-visible blocks. Command: `commit`.
