/** The subset of pi's extension API this module uses, plus the wire types for
 * dispatching a `memory hook <name>` subprocess. Deliberately local: the bridge
 * must stay loadable wherever pi runs, without depending on pi's package or on
 * any other cc-memory module. */

/** The JSON shapes pi hands to event handlers and hooks hand back. Narrowing
 * happens field-by-field at the use site, never through `unknown`. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonRecord;
export type JsonRecord = { readonly [key: string]: JsonValue };

/** The exact dispatch names `memory hook <name>` routes on — copy verbatim. */
export enum PiHookName {
  SessionStart = "session-start",
  MemoryInject = "memory-inject",
  WrapGate = "wrap-gate",
  CompactCheckpoint = "compact-checkpoint",
  WorklogFloor = "worklog-floor",
}

/** The stdin JSON a hook expects, keyed exactly as `PayloadParser` reads it. */
export type HookWirePayload =
  | { readonly cwd: string }
  | { readonly cwd: string; readonly prompt: string }
  | {
      readonly cwd: string;
      readonly session_id: string;
      readonly stop_hook_active: boolean;
    }
  | { readonly cwd: string; readonly compact_summary: string; readonly trigger: string }
  | { readonly cwd: string; readonly reason: string };

/** What a hook's stdout meant, decoded out of the hook JSON protocol. */
export enum ParsedHookOutputKind {
  Silent = "silent",
  Context = "context",
  Block = "block",
}

export type ParsedHookOutput =
  | { readonly kind: ParsedHookOutputKind.Silent }
  | { readonly kind: ParsedHookOutputKind.Context; readonly text: string }
  | { readonly kind: ParsedHookOutputKind.Block; readonly reason: string };

/** The result of one spawned CLI run, already collected. A timeout or spawn
 * failure surfaces as `ok: false` with whatever output was captured. */
export type SpawnOutcome = {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
};

/** The seam between the bridge and a process spawner. `input` is written to the
 * child's stdin before its stdout is read; `timeoutMs` kills the child. */
export type ProcessSpawnPort = (
  command: string,
  args: readonly string[],
  options: { readonly input: string; readonly timeoutMs: number },
) => Promise<SpawnOutcome>;

export type LogPort = (message: string) => void;

/** What the extension needs from the dispatch layer; the seam tests inject a
 * scripted implementation through. */
export type HookDispatchPort = {
  dispatch(
    hookName: PiHookName,
    payload: HookWirePayload,
  ): Promise<ParsedHookOutput | null>;
};

/** pi lifecycle events the bridge subscribes to. One loose shape covers every
 * event the bridge uses; each handler narrows only the fields it reads. */
export type PiHostEvent = {
  readonly prompt?: JsonValue;
  readonly reason?: JsonValue;
  /** pi's compaction entry; only its `summary` string matters here. */
  readonly compactionEntry?: JsonValue;
};

export type PiEventContext = {
  readonly cwd?: JsonValue;
  readonly sessionManager?: { readonly getSessionId: () => string };
};

export type PiEventHandler = (
  event: PiHostEvent,
  ctx: PiEventContext,
) => void | PiBeforeAgentStartResult | Promise<void | PiBeforeAgentStartResult>;

/** What `before_agent_start` may return to inject context ahead of the LLM call. */
export type PiBeforeAgentStartResult = {
  readonly message?: PiHostMessageResult;
};

export type PiHostMessageResult = {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
};

export type PiExtensionApi = {
  on(event: string, handler: PiEventHandler): void;
  sendUserMessage(content: string, options?: { readonly deliverAs: "followUp" }): void;
};
