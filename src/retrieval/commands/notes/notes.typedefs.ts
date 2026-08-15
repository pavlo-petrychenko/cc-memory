import type { CliCommand } from "@/core/index.ts";

export type NotesArgs = {
  readonly command: CliCommand.Notes;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly folder: string | null;
  readonly json: boolean;
};
