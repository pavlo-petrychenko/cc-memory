import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type ReindexArgs = {
  readonly command: CliCommand.Reindex;
  readonly workspace: string | null;
  readonly full: boolean;
};
