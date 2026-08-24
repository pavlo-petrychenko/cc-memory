# modules/sessionToggle

The session-scoped `/ccmemory` mute: per-session marker files that make every
hook dispatch go silent for exactly one host session, plus the `memory toggle`
command that flips them. Nothing persists across sessions and nothing is ever
read across workspaces — the markers are keyed by the host's own session id
(`CLAUDE_CODE_SESSION_ID`, the same id every hook event carries in its stdin).

- `commands/` — the `toggle` command resolver and its output formatter
- `useCases/` — flip/on/off/status resolution against the marker store
- `toggleMarker.repository.ts` — the `<session-id>.off` file store (implements
  core's `SessionTogglePort`; unsafe ids never touch the filesystem, expired
  markers are swept on every operation)

The runtime consumes the port, not this module: `core/transport/hook` guards
every dispatch through `SessionTogglePort`, and the composition root wires this
repository in. The pi bridge does NOT use this module — it toggles in-process.
