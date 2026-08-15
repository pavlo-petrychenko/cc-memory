/**
 * A generic JSON value, used for `~/.claude/settings.json` and
 * `~/.claude/memory/installed.json` — both files are read and written
 * without needing to understand every field (`settings.json` in particular
 * carries foreign top-level keys — `permissions`, other tools' config, … —
 * that must round-trip untouched). Mirrors `knowledge/note/note.typedefs.ts`'s
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

/** The closed set of ways reading one of these JSON files can fail. */
export enum JsonFileErrorKind {
  ParseError = "parse_error",
  NotAnObject = "not_an_object",
}

export type JsonFileError =
  | { readonly kind: JsonFileErrorKind.ParseError; readonly message: string }
  | { readonly kind: JsonFileErrorKind.NotAnObject };
