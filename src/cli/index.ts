export { CliCommand, parseArgs } from "@/cli/args/index.ts";
export type {
  ArgsError,
  CommitArgs,
  DoctorArgs,
  HelpArgs,
  HookArgs,
  InstallArgs,
  NotesArgs,
  ParsedArgs,
  ReindexArgs,
  ResolveArgs,
  SearchArgs,
  UninstallArgs,
  VersionArgs,
  WorkspaceAddArgs,
  WorkspaceLsArgs,
  WorkspaceRmArgs,
} from "@/cli/args/index.ts";
export { NO_HITS_MESSAGE, NO_WORKSPACES_MESSAGE } from "@/cli/cli.constants.ts";
export type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
export {
  formatCommitResult,
  formatCommitSkipped,
  formatCwdResolution,
  formatHookNotImplemented,
  formatNoNotes,
  formatNoteLine,
  formatNoWorkspaceForCwd,
  formatRegistryStatus,
  formatReindexLine,
  formatResolveLines,
  formatSearchHit,
  formatWorkspaceAdded,
  formatWorkspaceLsMatch,
  formatWorkspaceLsRow,
  formatWorkspaceRemovedPurged,
  formatWorkspaceUnregistered,
} from "@/cli/cli.formatter.ts";
export { help, version } from "@/cli/help/index.ts";
export { runCli } from "@/cli/main.ts";
export { cliFailure, cliOutcome } from "@/core/outcome/index.ts";
