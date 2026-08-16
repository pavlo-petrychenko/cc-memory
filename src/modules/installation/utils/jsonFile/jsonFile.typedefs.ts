/** Used for `settings.json` and `installed.json` — both read and written without
 * needing to understand every field, since `settings.json` carries foreign
 * top-level keys that must round-trip untouched. */
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
