/** Honest about what `JSON.parse` can hand back. */
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

export type MemoryInjectPayload = {
  readonly cwd: string | null;
  readonly prompt: string;
};

export type WrapGatePayload = {
  readonly cwd: string | null;
  readonly sessionId: string | null;
  readonly stopHookActive: boolean;
};

export type WorklogFloorPayload = {
  readonly cwd: string | null;
  readonly reason: string;
};

export type CompactCheckpointPayload = {
  readonly cwd: string | null;
  readonly compactSummary: string;
  readonly trigger: string;
};
