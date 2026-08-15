# commands/doctor

`memory doctor [--cwd PATH]` — the CLI surface over `doctor/`'s
`gatherDoctorReport`/`renderDoctorReport`.

Prints two lines itself, before calling into `doctor/`: registry status and
cwd-to-workspace resolution. Those two lines must stay byte-identical across
changes — tests anchor on exactly them.
