# worklogStore

Owns worklog paths and filesystem I/O: locating `STATE.md` and `<date>.md`
under `<kb>/_Worklogs/<slug>/`, reading state, listing recent journal entries,
appending to today's journal, and committing the worklogs directory in the kb
git repo.

Does not own the text of `STATE.md` or a journal entry — that's
`worklogFormat`. This module only reads and writes whatever text it's given.
