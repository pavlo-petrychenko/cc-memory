import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type WorkspaceLsRow = { readonly summaryLine: string; readonly matchLine: string };

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
