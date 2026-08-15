import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type NotesArgs = {
  readonly command: CliCommand.Notes;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly folder: string | null;
  readonly json: boolean;
};
