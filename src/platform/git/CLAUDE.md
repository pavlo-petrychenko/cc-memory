# git

The `Git` port, implemented over `Proc` rather than `child_process` directly,
so every git interaction is assertable against a scripted fake.

Every read-only method returns an empty string on a non-zero exit or a thrown
error (timeout, missing binary) instead of raising — callers that need to
distinguish "clean exit, no output" from "git failed" cannot with this port.
`add`/`commit` resolve `true` once the process runs to completion regardless
of git's own exit code, and `false` only on a timeout or spawn failure.

`showToplevel` alone runs with a 3s timeout; every other read is 5s, and
writes (`add`, `commit`) are 10s — see `git.constants.ts`.
