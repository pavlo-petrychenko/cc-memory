/**
 * The 5 Claude Code hook events this project handles. Values are the exact
 * `hookEventName` strings the protocol expects — copy verbatim, never re-derive.
 */
export enum HookEvent {
  SessionStart = "SessionStart",
  UserPromptSubmit = "UserPromptSubmit",
  Stop = "Stop",
  PostCompact = "PostCompact",
  SessionEnd = "SessionEnd",
}

/** The closed set of shapes a hook handler can produce, before rendering to JSON. */
export enum HookResultKind {
  Silent = "silent",
  Context = "context",
  Block = "block",
}

/**
 * What a hook handler decides to do, decoupled from the stdin/stdout JSON
 * protocol that `hookResult.serializer.ts` encodes it into.
 *
 *   silent  -> print nothing (the common case: cwd matched no workspace, etc.)
 *   context -> `{"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}`
 *   block   -> `{"decision": "block", "reason": reason}` (wrap-gate escalation only)
 */
export type HookResult =
  | { readonly kind: HookResultKind.Silent }
  | {
      readonly kind: HookResultKind.Context;
      readonly event: HookEvent;
      readonly text: string;
    }
  | { readonly kind: HookResultKind.Block; readonly reason: string };

/**
 * The five names `memory hook <name>` dispatches on.
 *
 * This enum has two independent consumers that must agree exactly:
 * `commands/hookDispatch/hookDispatch.command.ts` (which accepts the name)
 * and `install/settings.ts` (which writes it into `~/.claude/settings.json`).
 * A rename on one side without the other would silently register a name the
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
