/**
 * The five names `memory hook <name>` dispatches on.
 *
 * These have no Python precedent — `tools/install.py`'s `HOOKS` map keyed each
 * Claude Code event to a `.py` FILENAME, and there was no CLI subcommand at all.
 * They are chosen to match those filenames minus the extension.
 *
 * This enum lives in `domain/` rather than beside the CLI dispatcher because it has
 * TWO independent consumers that must agree exactly: `cli/commands/hook.command.ts`
 * (which accepts the name) and `install/settings.ts` (which writes it into
 * `~/.claude/settings.json`). They were originally written by two agents working in
 * parallel, each with its own copy of the strings — which happened to match, but
 * meant a rename on one side would silently register a name the other rejects.
 * Because hooks fail open, the symptom would not be an error: it would be memory
 * quietly not working in every session. Sharing one enum makes that a type error.
 */
export enum HookName {
  SessionStart = "session-start",
  MemoryInject = "memory-inject",
  WrapGate = "wrap-gate",
  WorklogFloor = "worklog-floor",
  CompactCheckpoint = "compact-checkpoint",
}
