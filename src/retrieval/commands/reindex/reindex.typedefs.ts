import type { CliCommand } from "@/core/index.ts";

export type ReindexArgs = {
  readonly command: CliCommand.Reindex;
  readonly workspace: string | null;
  readonly full: boolean;
};
