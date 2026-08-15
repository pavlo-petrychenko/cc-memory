import type { CliCommand } from "@/core/index.ts";

export type CommitArgs = {
  readonly command: CliCommand.Commit;
  readonly workspace: string | null;
  readonly message: string | null;
};
