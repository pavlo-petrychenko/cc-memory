# indexBuild

`buildIndex` — walks a workspace's vault and `_Worklogs/`, upserting
new/changed notes and worklog files into the index and pruning anything no
longer on disk.

Incremental by mtime by default; a schema-version bump
(`store/connection`'s `forcedFullRebuild`) forces a full rebuild regardless.
A malformed note or unreadable file is skipped silently rather than aborting
the whole reindex.
