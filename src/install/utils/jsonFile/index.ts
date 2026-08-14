export {
  isJsonArray,
  isJsonBoolean,
  isJsonNumber,
  isJsonObject,
  isJsonString,
  readJsonObjectFile,
  stringifyJson,
  writeJsonObjectAtomic,
} from "@/install/utils/jsonFile/jsonFile.service.ts";
export type {
  JsonFileError,
  JsonObject,
  JsonValue,
} from "@/install/utils/jsonFile/jsonFile.typedefs.ts";
export { JsonFileErrorKind } from "@/install/utils/jsonFile/jsonFile.typedefs.ts";
