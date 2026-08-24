import type { AbsPath } from "@/core/core.typedefs.ts";
import type { Workspace } from "@/core/domain.typedefs.ts";

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

/** Distinct from `workspace.kb`: a handler that shells out to `git` needs the
 * ACTUAL working directory, not the vault. */
export type HookContext = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
};

/** `Omit<TPayload, "cwd">` drops the raw, possibly-absent `cwd` string — it's
 * already been consumed to resolve `HookContext.cwd`, and no handler reads the
 * raw form. */
export type HookInput<TPayload> = Omit<TPayload, "cwd"> & HookContext;

/** `HookRuntimeService` calls `handle` exactly once a workspace has resolved for
 * the payload's cwd — no resolved workspace means `handle` is never called. */
export interface HookHandler<TPayload> {
  handle(payload: HookInput<TPayload>): Promise<HookResult>;
}

/** Whether memory activity is switched on for a host session. A missing marker
 * means enabled — the toggle can only ever silence, never enable by accident. */
export enum SessionToggleState {
  Enabled = "enabled",
  Disabled = "disabled",
}

/** Per-session mute state for memory activity, keyed by the session id both the
 * host's slash commands and its hook events know. Read failures fail open to
 * Enabled at the call site; writes surface errors to the caller. */
export interface SessionTogglePort {
  stateFor(sessionId: string): Promise<SessionToggleState>;
  disable(sessionId: string): Promise<void>;
  /** Re-enables by removing any marker; idempotent when none exists. */
  enable(sessionId: string): Promise<void>;
}

/** Resolves exactly one workspace for a cwd, or null when none matches. The
 * runtime depends on this port rather than on the workspace module — the
 * composition root supplies the implementation, keeping core free of feature
 * modules. */
export type WorkspaceResolver = (cwd: AbsPath) => Promise<Workspace | null>;
