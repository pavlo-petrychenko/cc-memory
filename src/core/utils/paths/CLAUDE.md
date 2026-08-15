# paths

Filesystem-path manipulation on `AbsPath`: expanding a leading `~`, collapsing
it back for storage, prefix containment, and the FTS index's relative-key
form.

`expandPath` is the sole constructor of `AbsPath` — every other function here
takes an already-expanded path. `home` always arrives as a parameter; nothing
here reads the environment.
