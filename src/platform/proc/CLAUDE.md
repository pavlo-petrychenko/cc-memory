# proc

The `Proc` port: the sole seam onto `Bun.spawn`/`child_process`. `Git` is
implemented over this, never over `child_process` directly.

A non-zero exit is a normal `ProcResult`, not a rejection — only a timeout or
a missing binary rejects the promise. A missing binary resolves with exit
code 127 (`COMMAND_NOT_FOUND_EXIT_CODE`) instead of throwing, because a tool
this project shells out to (`git`, `tmux`, `claude`) may simply not be
installed, and callers already treat a non-zero exit as "this did not work".
