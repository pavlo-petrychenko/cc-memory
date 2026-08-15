import { CliCommand } from "@/core/index.ts";
import type { DoctorArgs } from "@/modules/installation/commands/doctor/doctor.typedefs.ts";
import type {
  InstallArgs,
  UninstallArgs,
} from "@/modules/installation/commands/install/install.typedefs.ts";
import type { HookArgs } from "@/modules/session/commands/hookDispatch/hookDispatch.typedefs.ts";
import type { CommitArgs } from "@/modules/worklog/commands/commit/commit.typedefs.ts";
import type { ResolveArgs } from "@/modules/workspace/commands/resolve/resolve.typedefs.ts";
import type {
  WorkspaceAddArgs,
  WorkspaceLsArgs,
  WorkspaceRmArgs,
} from "@/modules/workspace/commands/workspace/workspace.typedefs.ts";
import type { NotesArgs } from "@/retrieval/commands/notes/notes.typedefs.ts";
import type { ReindexArgs } from "@/retrieval/commands/reindex/reindex.typedefs.ts";
import type { SearchArgs } from "@/retrieval/commands/search/search.typedefs.ts";

export { CliCommand };

export type HelpArgs = { readonly command: CliCommand.Help };

export type VersionArgs = { readonly command: CliCommand.Version };

export type {
  CommitArgs,
  DoctorArgs,
  HookArgs,
  InstallArgs,
  NotesArgs,
  ReindexArgs,
  ResolveArgs,
  SearchArgs,
  UninstallArgs,
  WorkspaceAddArgs,
  WorkspaceLsArgs,
  WorkspaceRmArgs,
};

export type ParsedArgs =
  | WorkspaceAddArgs
  | WorkspaceRmArgs
  | WorkspaceLsArgs
  | ResolveArgs
  | ReindexArgs
  | SearchArgs
  | NotesArgs
  | CommitArgs
  | DoctorArgs
  | HookArgs
  | InstallArgs
  | UninstallArgs
  | HelpArgs
  | VersionArgs;

export type ArgsError = { readonly message: string };
