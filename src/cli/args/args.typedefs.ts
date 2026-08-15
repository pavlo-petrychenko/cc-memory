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

export type WorkspaceAddArgs = {
  readonly command: CliCommand.WorkspaceAdd;
  readonly id: string;
  readonly match: readonly string[];
  readonly kb: string | null;
  readonly worklogs: string | null;
  readonly exclude: readonly string[] | null;
};

export type WorkspaceRmArgs = {
  readonly command: CliCommand.WorkspaceRm;
  readonly id: string;
  readonly purge: boolean;
};

export type WorkspaceLsArgs = { readonly command: CliCommand.WorkspaceLs };

export type ResolveArgs = {
  readonly command: CliCommand.Resolve;
  readonly cwd: string | null;
};

export type ReindexArgs = {
  readonly command: CliCommand.Reindex;
  readonly workspace: string | null;
  readonly full: boolean;
};

export type SearchArgs = {
  readonly command: CliCommand.Search;
  readonly query: string;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly limit: number;
  readonly worklog: boolean;
};

export type NotesArgs = {
  readonly command: CliCommand.Notes;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly folder: string | null;
  readonly json: boolean;
};

export type CommitArgs = {
  readonly command: CliCommand.Commit;
  readonly workspace: string | null;
  readonly message: string | null;
};

export type DoctorArgs = {
  readonly command: CliCommand.Doctor;
  readonly cwd: string | null;
  readonly prompt: string | null;
};

export type HookArgs = { readonly command: CliCommand.Hook; readonly name: string };

export type InstallArgs = {
  readonly command: CliCommand.Install;
  readonly dryRun: boolean;
};

export type UninstallArgs = { readonly command: CliCommand.Uninstall };

export type HelpArgs = { readonly command: CliCommand.Help };

export type VersionArgs = { readonly command: CliCommand.Version };

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
