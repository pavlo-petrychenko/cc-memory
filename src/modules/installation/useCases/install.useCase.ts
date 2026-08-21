import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  INSTALL_BANNER,
  INSTALL_DRY_RUN_BANNER,
  INSTALL_DRY_RUN_DONE_MESSAGE,
  SETTINGS_DIFF_HEADER,
} from "@/modules/installation/commands/install/install.constants.ts";
import { AgentTarget } from "@/modules/installation/install.typedefs.ts";
import {
  type InstallError,
  InstallErrorKind,
} from "@/modules/installation/install.typedefs.ts";
import { InstallService } from "@/modules/installation/services/install.service.ts";

export type InstallOptions = {
  readonly dryRun: boolean;
  /** Absent means every known target, mirroring the service default. */
  readonly targets?: readonly AgentTarget[];
};

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

/** The host names a finished install tells the user to open a session in. */
function hostsLabel(targets: readonly AgentTarget[]): string {
  const hasClaude = targets.includes(AgentTarget.ClaudeCode);
  const hasPi = targets.includes(AgentTarget.Pi);
  if (hasClaude && hasPi) return "Claude Code or pi";
  if (hasPi) return "pi";
  return "Claude Code";
}

/** One user-facing operation: install the CLI shim, skills, hooks and seed. */
export class InstallUseCase extends UseCase<
  InstallOptions,
  Result<readonly string[], string>
> {
  private readonly installService = this.makeService(InstallService);

  async execute(options: InstallOptions): Promise<Result<readonly string[], string>> {
    const baseRequest = {
      repoRoot: this.gateways.env.repoRoot(),
      dryRun: options.dryRun,
    };
    // `exactOptionalPropertyTypes` forbids an explicit `undefined` on the
    // optional field, so the property is added only when the user chose one.
    const request =
      options.targets === undefined
        ? baseRequest
        : { ...baseRequest, targets: options.targets };
    const result = await this.installService.install(request);
    if (!result.ok) return { ok: false, error: installErrorMessage(result.error) };

    const report = result.value;
    const lines: string[] = [report.dryRun ? INSTALL_DRY_RUN_BANNER : INSTALL_BANNER];
    if (report.settingsDiffLines.length > 0) {
      lines.push(SETTINGS_DIFF_HEADER, ...report.settingsDiffLines);
    }
    lines.push(...report.actionLines);
    const doneMessage = report.dryRun
      ? INSTALL_DRY_RUN_DONE_MESSAGE
      : `Done. Open a new ${hostsLabel(report.targets)} session under a registered workspace to use it.`;
    lines.push(doneMessage);
    return { ok: true, value: lines };
  }
}
