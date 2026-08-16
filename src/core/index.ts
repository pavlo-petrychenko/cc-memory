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
export {
  ARGS_PARSE_ERROR_EXIT_CODE,
  CLI_SUCCESS,
  DEFAULT_FAILURE_EXIT_CODE,
} from "@/core/entry/entry.constants.ts";
export {
  cliFailure,
  cliOutcome,
  flagValue,
  hasFlag,
  intFlag,
  registerCommand,
  requirePositional,
  variadicValues,
} from "@/core/entry/entry.utils.ts";
export type {
  ArgsError,
  CliOutcome,
  CommandDescriptor,
  CommandResult,
  EnvVarDescriptor,
  HookDescriptor,
  RegisteredCommand,
  RunContext,
} from "@/core/entry/entry.typedefs.ts";
export { Command } from "@/core/entry/command.decorator.ts";
export { Hook } from "@/core/entry/hook.decorator.ts";
export { TokenizerParser } from "@/core/search/tokenizer/tokenizer.parser.ts";
export { FtsQueryBuilder } from "@/core/search/ftsQuery/ftsQuery.builder.ts";
export { Ranker } from "@/core/search/ranking/rrf.ranker.ts";
export type { FusedHit, FuseInput, Hit } from "@/core/search/search.typedefs.ts";
export { HookRuntimeService } from "@/core/transport/hook/hook.runtime.ts";
export { HookResultSerializer } from "@/core/transport/hook/hookResult.serializer.ts";
export { PayloadParser } from "@/core/transport/hook/payload.parser.ts";
export {
  COMPACT_CHECKPOINT_HOOK,
  HOOK_DESCRIPTORS,
  MEMORY_INJECT_HOOK,
  SESSION_START_HOOK,
  WORKLOG_FLOOR_HOOK,
  WRAP_GATE_HOOK,
} from "@/core/transport/hook/hook.constants.ts";
export {
  HookEvent,
  HookName,
  HookResultKind,
} from "@/core/transport/hook/hook.typedefs.ts";
export type {
  HookContext,
  HookHandler,
  HookInput,
  HookResult,
  WorkspaceResolver,
} from "@/core/transport/hook/hook.typedefs.ts";
export type {
  CompactCheckpointPayload,
  MemoryInjectPayload,
  SessionStartPayload,
  WorklogFloorPayload,
  WrapGatePayload,
} from "@/core/transport/hook/payload.typedefs.ts";
