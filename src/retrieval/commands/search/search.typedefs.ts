import type { CliCommand } from "@/core/index.ts";

export type SearchArgs = {
  readonly command: CliCommand.Search;
  readonly query: string;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly limit: number;
  readonly worklog: boolean;
};
