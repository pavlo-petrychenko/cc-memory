/**
 * C2's stdin JSON protocol, parsed at the boundary: one typed shape per hook
 * event instead of the ad-hoc `payload.get(...)` calls scattered across the 5
 * `*.py` hooks. The union of fields any hook ever reads is `cwd`, `session_id`,
 * `source`, `prompt`, `stop_hook_active`, `compact_summary`, `trigger`,
 * `reason` — no single event needs all of them (`source` in particular is
 * accepted on `SessionStart`'s payload but never read anywhere in
 * `session-start.py`, so it has no field here either; that's not a gap, it's
 * the same thing Python does with it).
 *
 * `runtime.ts` owns the tolerant top-level parse (`parseTolerantJson`) — empty
 * or invalid stdin becomes `{}`, never a thrown error, matching every hook's
 * `json.loads(raw) if raw.strip() else {}` / `except Exception: payload = {}`
 * preamble. Each `parse*Payload` function below then reads its own fields out
 * of that already-parsed `JsonRecord`, tolerantly: a field of the wrong JSON
 * type is treated the same as an absent one rather than raising, which is
 * safe (`{}` on a malformed field is a *subset* of Python's behavior — Python
 * would raise inside a later `str` call and fall through to the outer
 * `except Exception: pass`, ending up silent all the same).
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
 * `json.loads(raw) if raw.strip() else {}` / `except Exception: payload = {}`
 * — the identical two-line preamble copy-pasted into every `*.py` hook's
 * `main()` (e.g. `hooks/session-start.py:112-116`). A parse that succeeds but
 * yields something other than a JSON object (an array, a string, a bare
 * number) is ALSO folded to `{}` here: Python's `payload.get(...)` on such a
 * value would raise `AttributeError`, caught by the outer `except Exception:
 * pass` in `__main__` — same observable result (silent), reached more
 * directly.
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

/** Read one field as a plain string, defaulting to `""` — for fields Python
 * reads via `payload.get(key, "")` or `(payload.get(key) or "")` rather than
 * an explicit fallback the caller applies itself. */
function stringFieldOrEmpty(record: JsonRecord, key: string): string {
  return stringField(record, key) ?? "";
}

/** Read one field as a plain boolean; anything else (absent, `null`, a
 * string) reads as `false` — Python's `payload.get(key)` truthiness check
 * only ever sees a real JSON boolean on this field in practice (C2). */
function booleanField(record: JsonRecord, key: string): boolean {
  const value = record[key];
  return isJsonBoolean(value) && value;
}

/** `SessionStart` (`hooks/session-start.py:117`) — only `cwd` is ever read. */
export type SessionStartPayload = { readonly cwd: string | null };

export function parseSessionStartPayload(record: JsonRecord): SessionStartPayload {
  return { cwd: stringField(record, "cwd") };
}

/** `UserPromptSubmit` (`hooks/memory-inject.py:59-60`). */
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

/** `Stop` (`hooks/wrap-gate.py:52,54-55`). */
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

/** `SessionEnd` (`hooks/worklog-floor.py:34,45`). */
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

/** `PostCompact` (`hooks/compact-checkpoint.py:24,27,33`). */
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
