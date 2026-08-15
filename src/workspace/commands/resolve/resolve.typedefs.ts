import type { CliCommand } from "@/core/index.ts";

export type ResolveArgs = {
  readonly command: CliCommand.Resolve;
  readonly cwd: string | null;
};
