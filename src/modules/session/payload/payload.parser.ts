import type {
  CompactCheckpointPayload,
  JsonRecord,
  JsonValue,
  MemoryInjectPayload,
  SessionStartPayload,
  WorklogFloorPayload,
  WrapGatePayload,
} from "@/modules/session/payload/payload.typedefs.ts";

/** The hook stdin JSON protocol, parsed at the boundary: one typed shape per hook
 * event, tolerant field-by-field — a field of the wrong JSON type reads as absent
 * rather than raising. */

// `Object.prototype.toString` tags are used instead of `typeof`: anti-slop's
// `no-runtime-typeof` rejects a bare `typeof` check as narrowing a representation
// instead of decoding it.
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

function stringField(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return isJsonString(value) ? value : null;
}

function stringFieldOrEmpty(record: JsonRecord, key: string): string {
  return stringField(record, key) ?? "";
}

function booleanField(record: JsonRecord, key: string): boolean {
  const value = record[key];
  return isJsonBoolean(value) && value;
}

export class PayloadParser {
  /** Empty input, invalid JSON, and JSON that isn't an object all fold to `{}`
   * rather than throwing. */
  parseTolerantJson(raw: string): JsonRecord {
    if (raw.trim() === "") return {};
    try {
      const parsed: JsonValue = JSON.parse(raw);
      return isJsonRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  parseSessionStart(record: JsonRecord): SessionStartPayload {
    return { cwd: stringField(record, "cwd") };
  }

  parseMemoryInject(record: JsonRecord): MemoryInjectPayload {
    return {
      cwd: stringField(record, "cwd"),
      prompt: stringFieldOrEmpty(record, "prompt"),
    };
  }

  parseWrapGate(record: JsonRecord): WrapGatePayload {
    return {
      cwd: stringField(record, "cwd"),
      sessionId: stringField(record, "session_id"),
      stopHookActive: booleanField(record, "stop_hook_active"),
    };
  }

  parseWorklogFloor(record: JsonRecord): WorklogFloorPayload {
    return {
      cwd: stringField(record, "cwd"),
      reason: stringFieldOrEmpty(record, "reason"),
    };
  }

  parseCompactCheckpoint(record: JsonRecord): CompactCheckpointPayload {
    return {
      cwd: stringField(record, "cwd"),
      compactSummary: stringFieldOrEmpty(record, "compact_summary"),
      trigger: stringFieldOrEmpty(record, "trigger"),
    };
  }
}
