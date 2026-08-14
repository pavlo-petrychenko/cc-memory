# doctor

Gathers and renders `memory doctor`'s diagnostics: every workspace's vault
directories and index health (via a real incremental reindex, which doubles
as both a reachability check and a staleness check), `settings.json`'s hook
registrations against the manifest, the recorded `bun` binary's existence,
and file sizes that tend to grow unbounded (`ccmem.log`).

`doctor.service.ts` gathers; `doctor.formatter.ts` renders the gathered
report to text. `commands/doctor/` owns the two lines that must stay
byte-identical across changes (registry status, cwd resolution) — those are
printed before this submodule is even called.
