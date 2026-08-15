import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type CommitArgs = {
  readonly command: CliCommand.Commit;
  readonly workspace: string | null;
  readonly message: string | null;
};
