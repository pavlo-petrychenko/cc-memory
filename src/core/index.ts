export type { AbsPath, JsonRecord, JsonValue, Result } from "@/core/core.typedefs.ts";
export type { RawWorkspace, Workspace, WorktreeSlug } from "@/core/domain.typedefs.ts";
export { UseCase } from "@/core/base/useCase.base.ts";
export { Service } from "@/core/base/service.base.ts";
export { Repository } from "@/core/base/repository.base.ts";
export { Projection } from "@/core/base/projection.base.ts";
export type { AppContext } from "@/core/base/context.typedefs.ts";
export type {
  FormatterConstructor,
  ProjectionConstructor,
  RepositoryConstructor,
  ServiceConstructor,
  UseCaseConstructor,
} from "@/core/base/constructor.typedefs.ts";
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
} from "@/core/transport/cli/cli.constants.ts";
export {
  cliFailure,
  cliOutcome,
  flagValue,
  hasFlag,
  intFlag,
  registerCommand,
  requirePositional,
  variadicValues,
} from "@/core/transport/cli/cli.utils.ts";
export type {
  ArgsError,
  CliOutcome,
  CommandResult,
  EnvVarDescriptor,
  RunContext,
} from "@/core/transport/cli/cli.typedefs.ts";
export type {
  CommandDescriptor,
  HookDescriptor,
  RegisteredCommand,
} from "@/core/entry/entry.typedefs.ts";
export { matchCommand, runCli } from "@/core/transport/cli/cli.runner.ts";
export {
  Command,
  registerCommands,
  type CommandHandler,
  type CommandParams,
} from "@/core/decorators/command.decorator.ts";
export {
  Hook,
  registerHooks,
  type HookHandler,
  type HookParams,
} from "@/core/decorators/hook.decorator.ts";
export { TokenizerParser } from "@/core/search/tokenizer/tokenizer.parser.ts";
export { FtsQueryBuilder } from "@/core/search/ftsQuery/ftsQuery.builder.ts";
export { Ranker } from "@/core/search/ranking/rrf.ranker.ts";
export type { FusedHit, FuseInput, Hit } from "@/core/search/search.typedefs.ts";
export {
  HookRuntimeService,
  runHookDispatch,
} from "@/core/transport/hook/hook.runtime.ts";
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
  SessionToggleState,
} from "@/core/transport/hook/hook.typedefs.ts";
export type {
  HookResult,
  SessionTogglePort,
  WorkspaceResolver,
} from "@/core/transport/hook/hook.typedefs.ts";
export type {
  CompactCheckpointPayload,
  MemoryInjectPayload,
  SessionStartPayload,
  WorklogFloorPayload,
  WrapGatePayload,
} from "@/core/transport/hook/payload.typedefs.ts";
