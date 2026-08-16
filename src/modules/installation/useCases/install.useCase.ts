import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  INSTALL_BANNER,
  INSTALL_DONE_MESSAGE,
  INSTALL_DRY_RUN_BANNER,
  INSTALL_DRY_RUN_DONE_MESSAGE,
  SETTINGS_DIFF_HEADER,
} from "@/modules/installation/commands/install/install.constants.ts";
import {
  InstallErrorKind,
  type InstallError,
} from "@/modules/installation/install.typedefs.ts";
import { InstallService } from "@/modules/installation/services/install.service.ts";

export type InstallOptions = { readonly dryRun: boolean };

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

/** One user-facing operation: install the CLI shim, skills, hooks and seed. */
export class InstallUseCase extends UseCase<
  InstallOptions,
  Result<readonly string[], string>
> {
  private readonly installService = this.makeService(InstallService);

  async execute(options: InstallOptions): Promise<Result<readonly string[], string>> {
    const result = await this.installService.install({
      repoRoot: this.gateways.env.repoRoot(),
      dryRun: options.dryRun,
    });
    if (!result.ok) return { ok: false, error: installErrorMessage(result.error) };

    const report = result.value;
    const lines: string[] = [report.dryRun ? INSTALL_DRY_RUN_BANNER : INSTALL_BANNER];
    if (report.settingsDiffLines.length > 0) {
      lines.push(SETTINGS_DIFF_HEADER, ...report.settingsDiffLines);
    }
    lines.push(...report.actionLines);
    lines.push(report.dryRun ? INSTALL_DRY_RUN_DONE_MESSAGE : INSTALL_DONE_MESSAGE);
    return { ok: true, value: lines };
  }
}
