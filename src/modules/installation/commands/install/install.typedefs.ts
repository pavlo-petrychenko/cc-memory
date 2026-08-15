import type { CliCommand } from "@/core/index.ts";

export type InstallArgs = {
  readonly command: CliCommand.Install;
  readonly dryRun: boolean;
};

export type UninstallArgs = { readonly command: CliCommand.Uninstall };
