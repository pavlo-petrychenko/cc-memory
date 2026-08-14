import type {
  Candidate,
  RelatedNote,
  ReflectorDecision,
} from "../../domain/Reflector.ts";
import { ReflectorAction } from "../../domain/Reflector.ts";
import { decisionPrompt } from "../../domain/render/proposals.renderer.ts";
import type { Result } from "../../domain/Result.ts";
import type { Proc, ProcResult } from "../../ports/proc.port.ts";

/**
 * The LLM decision step (`decide_with_llm`, `bin/reflector.py:128-144`). Two
 * deliberate improvements over the Python (packet P8, "improvements" list),
 * neither a behavior change to the three failure modes `write_proposals`'s
 * raw-candidate fallback depends on:
 *  - the prompt goes on **stdin**, not as a `claude -p <prompt>` argv element
 *    (`bin/reflector.py:133`) — a huge prompt no longer risks the platform's
 *    argv length limit;
 *  - the JSON array is extracted by scanning for a fenced ` ```json ` block
 *    first, then balanced bracket-matching — not the greedy `\[.*\]` at
 *    `bin/reflector.py:137`, which (with `re.DOTALL`) can swallow trailing
 *    prose after the real array or mis-match across more than one `[...]`
 *    span in the model's reply.
 */

const CLAUDE_TIMEOUT_MS = 240_000; // bin/reflector.py:133 — `claude -p` timeout (Porting Reference)
const STDERR_EXCERPT_LENGTH = 200; // bin/reflector.py:135 — `r.stderr.strip()[:200]`

const FENCED_JSON_BLOCK = /```(?:json)?[ \t]*\r?\n([\s\S]*?)```/u;

/** The first ` ```json ` (or bare ` ``` `) fenced block's content, trimmed —
 * the fast path a well-behaved model response usually takes. */
function extractFencedJsonBlock(text: string): string | null {
  const match = FENCED_JSON_BLOCK.exec(text);
  const captured = match?.[1];
  return captured === undefined ? null : captured.trim();
}

/**
 * The first balanced top-level `[...]` span in `text`, respecting string
 * literals and nested brackets/braces so a `]` inside a quoted string (or a
 * nested array/object) never truncates the match early. Returns `null` when
 * no `[` starts a properly-closed span at all — replaces the greedy
 * `\[.*\]` regex `bin/reflector.py:137` used.
 */
function extractBalancedJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let insideString = false;
  let escapeNext = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (insideString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (character === "\\") {
        escapeNext = true;
      } else if (character === '"') {
        insideString = false;
      }
      continue;
    }
    if (character === '"') {
      insideString = true;
      continue;
    }
    if (character === "[" || character === "{") {
      depth += 1;
    } else if (character === "]" || character === "}") {
      depth -= 1;
      if (depth === 0 && character === "]") return text.slice(start, index + 1);
    }
  }
  return null;
}

function extractJsonArrayText(modelOutput: string): string | null {
  const fenced = extractFencedJsonBlock(modelOutput);
  if (fenced !== null) return fenced;
  return extractBalancedJsonArray(modelOutput);
}

// A value that could plausibly come out of `JSON.parse` for a decision array:
// a scalar, a nested list, or a nested object. Deliberately NOT `unknown`/`any`
// — every branch is concrete, matching `domain/note.ts`'s identical `YamlValue`
// pattern for the same "arbitrary parsed-external-data" shape.
type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonRecord;
type JsonRecord = { readonly [key: string]: JsonValue };

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return (
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function isJsonString(value: JsonValue): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isJsonNumber(value: JsonValue): value is number {
  return Object.prototype.toString.call(value) === "[object Number]";
}

function readOptionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return value !== undefined && isJsonString(value) ? value : undefined;
}

function readOptionalNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return value !== undefined && isJsonNumber(value) ? value : undefined;
}

/** `action` narrowed to the enum, or `null` for anything else — matches
 * neither of `write_proposals`'s two checks (`bin/reflector.py:161-163`),
 * so Python already renders such an item as invisible either way. */
function parseAction(raw: string | undefined): ReflectorAction | null {
  switch (raw) {
    case ReflectorAction.Add:
      return ReflectorAction.Add;
    case ReflectorAction.Update:
      return ReflectorAction.Update;
    case ReflectorAction.Invalidate:
      return ReflectorAction.Invalidate;
    case ReflectorAction.Noop:
      return ReflectorAction.Noop;
    default:
      return null;
  }
}

/**
 * One raw JSON element -> a typed `ReflectorDecision`, or `null` for an
 * element that isn't an object or whose `action` isn't one of the four exact
 * strings the prompt asks for — dropped up front rather than rendered as a
 * `ReflectorAction`-typed lie, which is behavior-preserving (see
 * `parseAction`'s doc comment) and keeps every other field exactly as
 * tolerant as `renderProposals`'s own `?? ""`/`?? "(untitled)"` fallbacks
 * already are.
 */
function parseDecision(raw: JsonValue): ReflectorDecision | null {
  if (!isJsonRecord(raw)) return null;
  const action = parseAction(readOptionalString(raw, "action"));
  if (action === null) return null;

  const title = readOptionalString(raw, "title");
  const folder = readOptionalString(raw, "folder");
  const path = readOptionalString(raw, "path");
  const body = readOptionalString(raw, "body");
  const importance = readOptionalNumber(raw, "importance");
  const rationale = readOptionalString(raw, "rationale");
  const source = readOptionalString(raw, "source");

  return {
    action,
    ...(title !== undefined && { title }),
    ...(folder !== undefined && { folder }),
    ...(path !== undefined && { path }),
    ...(body !== undefined && { body }),
    ...(importance !== undefined && { importance }),
    ...(rationale !== undefined && { rationale }),
    ...(source !== undefined && { source }),
  };
}

/** `json.loads(m.group(0))` (`bin/reflector.py:140`) plus per-item shape
 * validation — `null` when the text isn't valid JSON, or isn't a JSON array
 * at its top level. `JSON.parse`'s return type is the one true I/O boundary
 * here (same reasoning as `domain/note.ts`'s `YAML.parse` call): its result
 * is handed straight to the concrete `JsonValue` union rather than through an
 * `unknown`-typed parameter anywhere in this module.
 */
function parseDecisions(jsonArrayText: string): readonly ReflectorDecision[] | null {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(jsonArrayText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const decisions: ReflectorDecision[] = [];
  for (const item of parsed) {
    const decision = parseDecision(item);
    if (decision !== null) decisions.push(decision);
  }
  return decisions;
}

/**
 * `decide_with_llm` (`bin/reflector.py:128-144`): invoke `claude -p` with the
 * decision prompt on stdin, parse its JSON-array reply into decisions. The
 * three failure modes `write_proposals`'s raw-candidate fallback depends on
 * all collapse to `{ok: false, error}` here: `claude` missing or the 240s
 * timeout firing (both surface as `Proc.run` rejecting — see `proc.port.ts`'s
 * doc comment, and `gitCli.adapter.ts` for the same one-catch pattern), a
 * non-zero exit, or output with no parseable JSON array in it.
 */
export async function decideWithLlm(
  proc: Proc,
  candidates: readonly Candidate[],
  related: readonly RelatedNote[],
): Promise<Result<readonly ReflectorDecision[], string>> {
  const prompt = decisionPrompt(candidates, related);

  let result: ProcResult;
  try {
    result = await proc.run("claude", ["-p"], {
      input: prompt,
      timeoutMs: CLAUDE_TIMEOUT_MS,
    });
  } catch {
    return {
      ok: false,
      error: "claude -p unavailable (binary not found, or the 240s timeout fired)",
    };
  }

  if (result.exitCode !== 0) {
    const excerpt = result.stderr.trim().slice(0, STDERR_EXCERPT_LENGTH);
    return { ok: false, error: `claude -p failed: ${excerpt}` };
  }

  const jsonArrayText = extractJsonArrayText(result.stdout.trim());
  if (jsonArrayText === null) {
    return { ok: false, error: "no JSON array in model output" };
  }
  const decisions = parseDecisions(jsonArrayText);
  if (decisions === null) {
    return { ok: false, error: "unable to parse JSON array in model output" };
  }
  return { ok: true, value: decisions };
}
