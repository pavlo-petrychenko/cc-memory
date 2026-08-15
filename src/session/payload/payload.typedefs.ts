/**
 * A JSON value shape honest about what `JSON.parse` can hand back — the same
 * technique the knowledge module's `YamlValue`/`YamlMapping` uses for the
 * analogous YAML-boundary parse.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonRecord;
export type JsonRecord = { readonly [key: string]: JsonValue };

/** `SessionStart` — only `cwd` is ever read. */
export type SessionStartPayload = { readonly cwd: string | null };

/** `UserPromptSubmit`. */
export type MemoryInjectPayload = {
  readonly cwd: string | null;
  readonly prompt: string;
};

/** `Stop`. */
export type WrapGatePayload = {
  readonly cwd: string | null;
  readonly sessionId: string | null;
  readonly stopHookActive: boolean;
};

/** `SessionEnd`. */
export type WorklogFloorPayload = {
  readonly cwd: string | null;
  readonly reason: string;
};

/** `PostCompact`. */
export type CompactCheckpointPayload = {
  readonly cwd: string | null;
  readonly compactSummary: string;
  readonly trigger: string;
};
