import type { DoctorArgs } from "@/install/commands/doctor/doctor.typedefs.ts";
import type {
  InstallArgs,
  UninstallArgs,
} from "@/install/commands/install/install.typedefs.ts";
import type { NotesArgs } from "@/retrieval/commands/notes/notes.typedefs.ts";
import type { ReindexArgs } from "@/retrieval/commands/reindex/reindex.typedefs.ts";
import type { SearchArgs } from "@/retrieval/commands/search/search.typedefs.ts";
import type { HookArgs } from "@/session/commands/hookDispatch/hookDispatch.typedefs.ts";
import type { CommitArgs } from "@/worklog/commands/commit/commit.typedefs.ts";
import type { ResolveArgs } from "@/workspace/commands/resolve/resolve.typedefs.ts";
import type {
  WorkspaceAddArgs,
  WorkspaceLsArgs,
  WorkspaceRmArgs,
} from "@/workspace/commands/workspace/workspace.typedefs.ts";

/** The closed set of subcommands. */
export enum CliCommand {
  WorkspaceAdd = "workspace_add",
  WorkspaceRm = "workspace_rm",
  WorkspaceLs = "workspace_ls",
  Resolve = "resolve",
  Reindex = "reindex",
  Search = "search",
  Notes = "notes",
  Commit = "commit",
  Doctor = "doctor",
  Hook = "hook",
  Install = "install",
  Uninstall = "uninstall",
  /** `-h`/`--help`, or no arguments at all. */
  Help = "help",
  Version = "version",
}

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
