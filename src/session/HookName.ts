/**
 * The five names `memory hook <name>` dispatches on.
 *
 * This enum has two independent consumers that must agree exactly:
 * `cli/commands/hook.command.ts` (which accepts the name) and
 * `install/settings.ts` (which writes it into `~/.claude/settings.json`). A
 * rename on one side without the other would silently register a name the
 * other rejects — and because hooks fail open, the symptom would not be an
 * error, it would be memory quietly not working in every session. Sharing one
 * enum makes that a type error instead.
 */
export enum HookName {
  SessionStart = "session-start",
  MemoryInject = "memory-inject",
  WrapGate = "wrap-gate",
  WorklogFloor = "worklog-floor",
  CompactCheckpoint = "compact-checkpoint",
}
