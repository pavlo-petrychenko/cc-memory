import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type ResolveArgs = {
  readonly command: CliCommand.Resolve;
  readonly cwd: string | null;
};
