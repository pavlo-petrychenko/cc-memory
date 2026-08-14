# fileSystem

The `FileSystem` port: every read, write and stat this project performs, over
`node:fs/promises`. Every path in and out is an `AbsPath` — callers resolve
`~` and relative fragments before calling here.

Content is always UTF-8 text; there is no binary I/O anywhere in the vault or
registry. `mkdir`/`remove` are recursive and idempotent so callers never have
to check what already exists.
