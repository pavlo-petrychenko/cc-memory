/**
 * The hook stdin JSON protocol, parsed at the boundary: one typed shape per
 * hook event. The union of fields any hook ever reads is `cwd`, `session_id`,
 * `source`, `prompt`, `stop_hook_active`, `compact_summary`, `trigger`,
 * `reason` — no single event needs all of them (`SessionStart`'s payload
 * accepts a `source` field that is never read, so it has no field here
 * either).
 *
 * `runtime.ts` owns the tolerant top-level parse (`parseTolerantJson`) —
 * empty or invalid stdin becomes `{}`, never a thrown error. Each
 * `parse*Payload` function below then reads its own fields out of that
 * already-parsed `JsonRecord`, tolerantly: a field of the wrong JSON type is
 * treated the same as an absent one rather than raising.
 */

/** A JSON value shape honest about what `JSON.parse` can hand back — the same
 * technique `domain/note.ts`'s `YamlValue`/`YamlMapping` uses for the analogous
 * YAML-boundary parse. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonRecord;
export type JsonRecord = { readonly [key: string]: JsonValue };

// `typeof`/`Array.isArray` are avoided in favor of `Object.prototype.toString`
// tags, the same idiom `services/registry.service.ts`'s `isTomlString`/
// `isTomlTableValue` use for the analogous TOML-boundary check (anti-slop's
// `no-runtime-typeof` rejects a bare `typeof` check as narrowing a
// representation instead of decoding it).
function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value !== null && Object.prototype.toString.call(value) === "[object Object]";
}

function isJsonString(value: JsonValue | undefined): value is string {
  return (
    value !== undefined && Object.prototype.toString.call(value) === "[object String]"
  );
}

function isJsonBoolean(value: JsonValue | undefined): value is boolean {
  return (
    value !== undefined && Object.prototype.toString.call(value) === "[object Boolean]"
  );
}

/**
 * Parses stdin tolerantly: empty input, invalid JSON, and JSON that parses
 * but isn't an object (an array, a string, a bare number) all fold to `{}`
 * rather than throwing, so a malformed payload results in every field
 * reading as absent instead of the hook crashing.
 */
export function parseTolerantJson(raw: string): JsonRecord {
  if (raw.trim() === "") return {};
  try {
    const parsed: JsonValue = JSON.parse(raw);
    return isJsonRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Read one field as a plain string, or `null` if absent/wrongly typed. */
function stringField(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return isJsonString(value) ? value : null;
}

/** Read one field as a plain string, defaulting to `""` when absent. */
function stringFieldOrEmpty(record: JsonRecord, key: string): string {
  return stringField(record, key) ?? "";
}

/** Read one field as a plain boolean; anything else (absent, `null`, a
 * string) reads as `false`. */
function booleanField(record: JsonRecord, key: string): boolean {
  const value = record[key];
  return isJsonBoolean(value) && value;
}

/** `SessionStart` — only `cwd` is ever read. */
export type SessionStartPayload = { readonly cwd: string | null };

export function parseSessionStartPayload(record: JsonRecord): SessionStartPayload {
  return { cwd: stringField(record, "cwd") };
}

/** `UserPromptSubmit`. */
export type MemoryInjectPayload = {
  readonly cwd: string | null;
  readonly prompt: string;
};

export function parseMemoryInjectPayload(record: JsonRecord): MemoryInjectPayload {
  return {
    cwd: stringField(record, "cwd"),
    prompt: stringFieldOrEmpty(record, "prompt"),
  };
}

/** `Stop`. */
export type WrapGatePayload = {
  readonly cwd: string | null;
  readonly sessionId: string | null;
  readonly stopHookActive: boolean;
};

export function parseWrapGatePayload(record: JsonRecord): WrapGatePayload {
  return {
    cwd: stringField(record, "cwd"),
    sessionId: stringField(record, "session_id"),
    stopHookActive: booleanField(record, "stop_hook_active"),
  };
}

/** `SessionEnd`. */
export type WorklogFloorPayload = {
  readonly cwd: string | null;
  readonly reason: string;
};

export function parseWorklogFloorPayload(record: JsonRecord): WorklogFloorPayload {
  return {
    cwd: stringField(record, "cwd"),
    reason: stringFieldOrEmpty(record, "reason"),
  };
}

/** `PostCompact`. */
export type CompactCheckpointPayload = {
  readonly cwd: string | null;
  readonly compactSummary: string;
  readonly trigger: string;
};

export function parseCompactCheckpointPayload(
  record: JsonRecord,
): CompactCheckpointPayload {
  return {
    cwd: stringField(record, "cwd"),
    compactSummary: stringFieldOrEmpty(record, "compact_summary"),
    trigger: stringFieldOrEmpty(record, "trigger"),
  };
}
