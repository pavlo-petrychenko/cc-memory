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
 * protocol that `hookResult.renderer.ts` encodes it into.
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
