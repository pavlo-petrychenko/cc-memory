import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type InstallArgs = {
  readonly command: CliCommand.Install;
  readonly dryRun: boolean;
};

export type UninstallArgs = { readonly command: CliCommand.Uninstall };
