export type { AbsPath, JsonRecord, JsonValue, Result } from "@/core/core.typedefs.ts";
export type { RawWorkspace, Workspace, WorktreeSlug } from "@/core/domain.typedefs.ts";
export { ConfigParser } from "@/core/config/config.parser.ts";
export type { Config, EnvSnapshot } from "@/core/config/config.typedefs.ts";
export { LogLevel } from "@/core/config/config.typedefs.ts";
export {
  absPath,
  expandPath,
  indexDbPath,
  injectLogPath,
  isUnder,
  joinAbs,
  logPath,
  manifestPath,
  parentDir,
  registryPath,
  relativeTo,
  relKey,
  tildify,
  tryAbsPath,
} from "@/core/utils/paths/paths.utils.ts";
export { CCMEM_HOME } from "@/core/utils/paths/paths.constants.ts";
export type { PathError } from "@/core/utils/paths/paths.typedefs.ts";
export { PathErrorKind } from "@/core/utils/paths/paths.typedefs.ts";
export { sanitizeSlug, stripChars, titleize } from "@/core/utils/slug/slug.utils.ts";
export { CLI_SUCCESS } from "@/core/outcome/outcome.constants.ts";
export { cliFailure, cliOutcome } from "@/core/outcome/outcome.utils.ts";
export type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
