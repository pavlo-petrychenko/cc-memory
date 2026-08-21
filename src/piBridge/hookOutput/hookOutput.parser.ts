import { ParsedHookOutputKind } from "@/piBridge/piBridge.typedefs.ts";
import type {
  JsonRecord,
  JsonValue,
  ParsedHookOutput,
} from "@/piBridge/piBridge.typedefs.ts";

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value !== null && Object.prototype.toString.call(value) === "[object Object]";
}

function isJsonString(value: JsonValue): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

/** Indexing a record yields `JsonValue | undefined`; absent reads as null. */
function stringField(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (value === undefined) return null;
  return isJsonString(value) ? value : null;
}

/** Decodes hook stdout — the same JSON protocol Claude Code reads — into what
 * the bridge should do. Empty, malformed, and unrecognized input all decode to
 * `Silent`: the bridge never acts on output it does not fully understand. */
export class HookOutputParser {
  parse(rawStdout: string): ParsedHookOutput {
    const trimmed = rawStdout.trim();
    if (trimmed === "") return { kind: ParsedHookOutputKind.Silent };

    let decoded: JsonValue;
    try {
      decoded = JSON.parse(trimmed);
    } catch {
      return { kind: ParsedHookOutputKind.Silent };
    }
    if (!isJsonRecord(decoded)) return { kind: ParsedHookOutputKind.Silent };

    const reason = stringField(decoded, "reason");
    if (stringField(decoded, "decision") === "block" && reason !== null) {
      return { kind: ParsedHookOutputKind.Block, reason };
    }

    const specific = decoded["hookSpecificOutput"];
    if (specific !== undefined && isJsonRecord(specific)) {
      const additionalContext = stringField(specific, "additionalContext");
      if (additionalContext !== null && additionalContext !== "") {
        return { kind: ParsedHookOutputKind.Context, text: additionalContext };
      }
    }

    return { kind: ParsedHookOutputKind.Silent };
  }
}
