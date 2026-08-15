# shim

Owns `~/.local/bin/memory`: a 2-line `sh` script with the resolved `bun`
binary and `dist/memory.js` paths baked in absolute, so it runs regardless
of the caller's `PATH`.

Writing always removes any pre-existing path first — `writeFile` follows a
symlink, so writing directly over one would silently overwrite whatever it
pointed at instead of replacing the link itself.
