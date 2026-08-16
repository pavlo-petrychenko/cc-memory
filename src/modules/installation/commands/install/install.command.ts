import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure, hasFlag } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import {
  INSTALL_BANNER,
  INSTALL_DESCRIPTOR,
  INSTALL_DONE_MESSAGE,
  INSTALL_DRY_RUN_BANNER,
  INSTALL_DRY_RUN_DONE_MESSAGE,
  SETTINGS_DIFF_HEADER,
  UNINSTALL_BANNER,
  UNINSTALL_DESCRIPTOR,
  UNINSTALL_NOTHING_MESSAGE,
} from "@/modules/installation/commands/install/install.constants.ts";
import {
  InstallErrorKind,
  type InstallError,
} from "@/modules/installation/install.typedefs.ts";
import { InstallService } from "@/modules/installation/install.useCase.ts";

export type InstallOptions = { readonly dryRun: boolean };
export type UninstallOptions = Record<string, never>;

function installErrorMessage(error: InstallError): string {
  switch (error.kind) {
    case InstallErrorKind.BunNotFound:
      return "bun not found on PATH ('which bun' failed) — install bun first";
    case InstallErrorKind.BunUnresolvable:
      return (
        `could not resolve a real bun binary from '${error.attemptedPath}' — ` +
        "refusing to record an ephemeral path"
      );
    case InstallErrorKind.SettingsUnreadable:
      return error.message;
  }
}

@Command(INSTALL_DESCRIPTOR)
export class InstallCommand implements CommandContract<InstallOptions> {
  constructor(private readonly container: Gateways) {}

  parse(tokens: readonly string[]): Result<InstallOptions, ArgsError> {
    return { ok: true, value: { dryRun: hasFlag(tokens, "--dry-run") } };
  }

  async run(options: InstallOptions, _context: RunContext): Promise<CommandResult> {
    const result = await new InstallService(this.container).install({
      repoRoot: this.container.env.repoRoot(),
      dryRun: options.dryRun,
    });
    if (!result.ok)
      return { lines: [], ...cliFailure(installErrorMessage(result.error)) };

    const report = result.value;
    const lines: string[] = [report.dryRun ? INSTALL_DRY_RUN_BANNER : INSTALL_BANNER];
    if (report.settingsDiffLines.length > 0) {
      lines.push(SETTINGS_DIFF_HEADER, ...report.settingsDiffLines);
    }
    lines.push(...report.actionLines);
    lines.push(report.dryRun ? INSTALL_DRY_RUN_DONE_MESSAGE : INSTALL_DONE_MESSAGE);
    return { lines, ...CLI_SUCCESS };
  }
}

@Command(UNINSTALL_DESCRIPTOR)
export class UninstallCommand implements CommandContract<UninstallOptions> {
  constructor(private readonly container: Gateways) {}

  parse(_tokens: readonly string[]): Result<UninstallOptions, ArgsError> {
    return { ok: true, value: {} };
  }

  async run(_options: UninstallOptions, _context: RunContext): Promise<CommandResult> {
    const report = await new InstallService(this.container).uninstall();
    const lines = [report.uninstalled ? UNINSTALL_BANNER : UNINSTALL_NOTHING_MESSAGE];
    if (report.uninstalled) lines.push(...report.actionLines);
    return { lines, ...CLI_SUCCESS };
  }
}
