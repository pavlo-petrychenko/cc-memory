import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  type JsonFileError,
  JsonFileErrorKind,
  type JsonObject,
  type JsonValue,
} from "@/install/utils/jsonFile/jsonFile.typedefs.ts";
import type { FileSystem } from "@/platform/index.ts";

/**
 * Reads and writes a JSON file whose top level is an object — `settings.json`
 * and `installed.json` both are. The type guards and serializer are pure
 * (grouped here as `static` members since they take no `FileSystem`); reading
 * and writing are the only members that need one, injected once through the
 * constructor rather than threaded through every call.
 */
export class JsonFileService {
  constructor(private readonly fs: FileSystem) {}

  // `Object.prototype.toString` gives the precise representation tag instead
  // of `typeof`, the same technique `note.parser.ts`'s `isYamlMapping` and
  // `registry.service.ts`'s `isTomlTableValue` use for the identical boundary
  // check (a `typeof x === "object"` narrows a representation without
  // establishing a domain contract — anti-slop's `no-runtime-typeof`).
  static isObject(value: JsonValue): value is JsonObject {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  static isArray(value: JsonValue): value is readonly JsonValue[] {
    return Array.isArray(value);
  }

  // Same `Object.prototype.toString` technique as `isObject` above — a bare
  // `typeof` check is banned everywhere in this codebase (anti-slop
  // `no-runtime-typeof`) precisely because it narrows a representation
  // without forcing the caller through a named parse step; these three give
  // every consumer of `JsonValue` the primitive equivalent.
  static isString(value: JsonValue): value is string {
    return Object.prototype.toString.call(value) === "[object String]";
  }

  static isNumber(value: JsonValue): value is number {
    return Object.prototype.toString.call(value) === "[object Number]";
  }

  static isBoolean(value: JsonValue): value is boolean {
    return Object.prototype.toString.call(value) === "[object Boolean]";
  }

  /** Two-space-indented JSON plus a trailing newline — the exact
   * serialization shape for every JSON file this installer writes, so a
   * byte-for-byte diff against a hand-edited `settings.json` stays quiet on
   * everything this installer didn't touch. */
  static stringify(value: JsonValue): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  /** The parent directory of an already-absolute, normalized `AbsPath` — the
   * same small utility several service files each keep a private copy of
   * (see `registry.service.ts`'s `parentDir` doc comment). */
  private static parentDirectory(path: AbsPath): AbsPath {
    const lastSlashIndex = path.lastIndexOf("/");
    const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
    // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
    // another absolute, normalized path (or the root `/`).
    return sliced as AbsPath;
  }

  /**
   * Read a JSON file expected to hold a top-level object. A MISSING file
   * yields `{}` (treated the same as "nothing configured yet"); a PRESENT
   * file that fails to parse, or parses to something other than an object,
   * is a typed error instead of an uncaught exception.
   */
  async readObjectFile(path: AbsPath): Promise<Result<JsonObject, JsonFileError>> {
    if (!(await this.fs.exists(path))) return { ok: true, value: {} };
    const content = await this.fs.readFile(path);
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { kind: JsonFileErrorKind.ParseError, message } };
    }
    if (!JsonFileService.isObject(parsed)) {
      return { ok: false, error: { kind: JsonFileErrorKind.NotAnObject } };
    }
    return { ok: true, value: parsed };
  }

  /** Write a JSON file atomically: `<path>.tmp` then rename over it — the
   * same pattern `registry.service.ts`'s `saveRegistry` uses for
   * `registry.toml`, applied here to `settings.json`/`installed.json` so a
   * reader never observes a half-written file. */
  async writeObjectAtomic(path: AbsPath, value: JsonObject): Promise<void> {
    await this.fs.mkdir(JsonFileService.parentDirectory(path));
    const tmpPath = `${path}.tmp`;
    // SAFETY: appending a fixed `.tmp` suffix to an absolute, normalized path
    // cannot introduce a `~`, `.` or `..` segment.
    const tmpAbsPath = tmpPath as AbsPath;
    await this.fs.writeFile(tmpAbsPath, JsonFileService.stringify(value));
    await this.fs.rename(tmpAbsPath, path);
  }
}
