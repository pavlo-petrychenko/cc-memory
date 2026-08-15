import type { AbsPath } from "@/core/index.ts";
import { absPath, parentDir } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import {
  type JsonFileError,
  JsonFileErrorKind,
  type JsonObject,
  type JsonValue,
} from "@/install/utils/jsonFile/jsonFile.typedefs.ts";

/** Reads and writes a JSON file whose top level is an object — `settings.json` and
 * `installed.json` both are. */
export class JsonFileService {
  constructor(private readonly fs: FileSystem) {}

  // `Object.prototype.toString` gives the precise representation tag instead of
  // `typeof`, which anti-slop's `no-runtime-typeof` bans as narrowing a
  // representation without establishing a domain contract.
  static isObject(value: JsonValue): value is JsonObject {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  static isArray(value: JsonValue): value is readonly JsonValue[] {
    return Array.isArray(value);
  }

  static isString(value: JsonValue): value is string {
    return Object.prototype.toString.call(value) === "[object String]";
  }

  static isNumber(value: JsonValue): value is number {
    return Object.prototype.toString.call(value) === "[object Number]";
  }

  static isBoolean(value: JsonValue): value is boolean {
    return Object.prototype.toString.call(value) === "[object Boolean]";
  }

  static stringify(value: JsonValue): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  /** A missing file yields `{}`; a malformed one is a typed error, not an
   * uncaught exception. */
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

  /** Atomic write: `<path>.tmp` then rename over it, so a reader never observes a
   * half-written file. */
  async writeObjectAtomic(path: AbsPath, value: JsonObject): Promise<void> {
    await this.fs.mkdir(parentDir(path));
    const tmpAbsPath = absPath(`${path}.tmp`);
    await this.fs.writeFile(tmpAbsPath, JsonFileService.stringify(value));
    await this.fs.rename(tmpAbsPath, path);
  }
}
