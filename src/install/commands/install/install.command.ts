import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import {
  INSTALL_BANNER,
  INSTALL_DONE_MESSAGE,
  INSTALL_DRY_RUN_BANNER,
  INSTALL_DRY_RUN_DONE_MESSAGE,
  SETTINGS_DIFF_HEADER,
  UNINSTALL_BANNER,
  UNINSTALL_NOTHING_MESSAGE,
} from "@/install/commands/install/install.constants.ts";
import type { InstallArgs } from "@/install/commands/install/install.typedefs.ts";
import { InstallService } from "@/install/install.service.ts";
import { type InstallError, InstallErrorKind } from "@/install/install.typedefs.ts";
import type { Container } from "@/platform/index.ts";

/** `memory install [--dry-run]` / `memory uninstall`. Both classes take `container`
 * as a required constructor parameter, built from the real `process.env` at
 * `main.ts`'s dispatch; a test supplies `makeTestContainer(...)` instead and never
 * touches a real container. */
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

export class InstallCommand {
  constructor(private readonly container: Container) {}

  async execute(args: InstallArgs): Promise<CliOutcome> {
    const result = await new InstallService(this.container).install({
      repoRoot: this.container.env.repoRoot(),
      dryRun: args.dryRun,
    });
    if (!result.ok) return cliFailure(installErrorMessage(result.error));

    const report = result.value;
    this.container.stdio.write(report.dryRun ? INSTALL_DRY_RUN_BANNER : INSTALL_BANNER);
    if (report.settingsDiffLines.length > 0) {
      this.container.stdio.write(SETTINGS_DIFF_HEADER);
      for (const line of report.settingsDiffLines) this.container.stdio.write(line);
    }
    for (const line of report.actionLines) this.container.stdio.write(line);
    this.container.stdio.write(
      report.dryRun ? INSTALL_DRY_RUN_DONE_MESSAGE : INSTALL_DONE_MESSAGE,
    );
    return CLI_SUCCESS;
  }
}

export class UninstallCommand {
  constructor(private readonly container: Container) {}

  async execute(): Promise<CliOutcome> {
    const report = await new InstallService(this.container).uninstall();
    this.container.stdio.write(
      report.uninstalled ? UNINSTALL_BANNER : UNINSTALL_NOTHING_MESSAGE,
    );
    if (report.uninstalled) {
      for (const line of report.actionLines) this.container.stdio.write(line);
    }
    return CLI_SUCCESS;
  }
}
