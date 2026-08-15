import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type SearchArgs = {
  readonly command: CliCommand.Search;
  readonly query: string;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly limit: number;
  readonly worklog: boolean;
};
