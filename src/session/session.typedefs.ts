/** Values are the exact `hookEventName` strings the protocol expects — copy
 * verbatim, never re-derive. */
export enum HookEvent {
  SessionStart = "SessionStart",
  UserPromptSubmit = "UserPromptSubmit",
  Stop = "Stop",
  PostCompact = "PostCompact",
  SessionEnd = "SessionEnd",
}

export enum HookResultKind {
  Silent = "silent",
  Context = "context",
  Block = "block",
}

/** What a hook handler decides to do, decoupled from the stdin/stdout JSON protocol
 * `hookResult.serializer.ts` encodes it into. `Block` is wrap-gate escalation only. */
export type HookResult =
  | { readonly kind: HookResultKind.Silent }
  | {
      readonly kind: HookResultKind.Context;
      readonly event: HookEvent;
      readonly text: string;
    }
  | { readonly kind: HookResultKind.Block; readonly reason: string };

/** The five names `memory hook <name>` dispatches on. Shared by both
 * `hookDispatch.command.ts` and the install step that registers them in
 * `settings.json` — a rename on only one side would fail open silently, so
 * sharing one enum makes the mismatch a type error instead. */
export enum HookName {
  SessionStart = "session-start",
  MemoryInject = "memory-inject",
  WrapGate = "wrap-gate",
  WorklogFloor = "worklog-floor",
  CompactCheckpoint = "compact-checkpoint",
}
