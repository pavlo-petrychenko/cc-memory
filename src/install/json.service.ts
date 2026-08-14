import type { AbsPath } from "../core/AbsPath.ts";
import type { Result } from "../core/Result.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";

/**
 * A generic JSON value, used for `~/.claude/settings.json` and
 * `~/.claude/memory/installed.json` — both files are read and written
 * without needing to understand every field (`settings.json` in particular
 * carries foreign top-level keys — `permissions`, other tools' config, … —
 * that must round-trip untouched). Mirrors `domain/note.ts`'s
 * `YamlValue`/`YamlMapping` pair, the established pattern in this codebase for
 * "parse untrusted structured data without a `Record<string, unknown>` bag."
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };

// `Object.prototype.toString` gives the precise representation tag instead of
// `typeof`, the same technique `domain/note.ts`'s `isYamlMapping` and
// `registry.service.ts`'s `isTomlTableValue` use for the identical boundary
// check (a `typeof x === "object"` narrows a representation without
// establishing a domain contract — anti-slop's `no-runtime-typeof`).
export function isJsonObject(value: JsonValue): value is JsonObject {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

// Same `Object.prototype.toString` technique as `isJsonObject` above — a bare
// `typeof` check is banned everywhere in this codebase (anti-slop
// `no-runtime-typeof`) precisely because it narrows a representation without
// forcing the caller through a named parse step; these three give every
// consumer of `JsonValue` the primitive equivalent.
export function isJsonString(value: JsonValue): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

export function isJsonNumber(value: JsonValue): value is number {
  return Object.prototype.toString.call(value) === "[object Number]";
}

export function isJsonBoolean(value: JsonValue): value is boolean {
  return Object.prototype.toString.call(value) === "[object Boolean]";
}

/** The closed set of ways reading one of these JSON files can fail. */
export enum JsonFileErrorKind {
  ParseError = "parse_error",
  NotAnObject = "not_an_object",
}

export type JsonFileError =
  | { readonly kind: JsonFileErrorKind.ParseError; readonly message: string }
  | { readonly kind: JsonFileErrorKind.NotAnObject };

/**
 * Read a JSON file expected to hold a top-level object — `settings.json` and
 * `installed.json` both are. A MISSING file yields `{}` (treated the same as
 * "nothing configured yet"); a PRESENT file that fails to parse, or parses to
 * something other than an object, is a typed error instead of an uncaught
 * exception.
 */
export async function readJsonObjectFile(
  fs: FileSystem,
  path: AbsPath,
): Promise<Result<JsonObject, JsonFileError>> {
  if (!(await fs.exists(path))) return { ok: true, value: {} };
  const content = await fs.readFile(path);
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: JsonFileErrorKind.ParseError, message } };
  }
  if (!isJsonObject(parsed)) {
    return { ok: false, error: { kind: JsonFileErrorKind.NotAnObject } };
  }
  return { ok: true, value: parsed };
}

/** Two-space-indented JSON plus a trailing newline — the exact serialization
 * shape for every JSON file this installer writes, so a byte-for-byte diff
 * against a hand-edited `settings.json` stays quiet on everything this
 * installer didn't touch. */
export function stringifyJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The parent directory of an already-absolute, normalized `AbsPath` — the
 * same small utility several `services/**` files each keep a private copy of
 * (see `registry.service.ts`'s `parentDir` doc comment). */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path (or the root `/`).
  return sliced as AbsPath;
}

/** Write a JSON file atomically: `<path>.tmp` then rename over it — the same
 * pattern `registry.service.ts`'s `saveRegistry` uses for `registry.toml`,
 * applied here to `settings.json`/`installed.json` so a reader never
 * observes a half-written file. */
export async function writeJsonObjectAtomic(
  fs: FileSystem,
  path: AbsPath,
  value: JsonObject,
): Promise<void> {
  await fs.mkdir(parentDirectory(path));
  const tmpPath = `${path}.tmp`;
  // SAFETY: appending a fixed `.tmp` suffix to an absolute, normalized path
  // cannot introduce a `~`, `.` or `..` segment.
  const tmpAbsPath = tmpPath as AbsPath;
  await fs.writeFile(tmpAbsPath, stringifyJson(value));
  await fs.rename(tmpAbsPath, path);
}
