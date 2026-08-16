import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  UNINSTALL_BANNER,
  UNINSTALL_NOTHING_MESSAGE,
} from "@/modules/installation/commands/install/install.constants.ts";
import { InstallService } from "@/modules/installation/services/install.service.ts";

/** One user-facing operation: uninstall the shim, skills and hook registrations. */
export class UninstallUseCase extends UseCase<
  Record<string, never>,
  Result<readonly string[], string>
> {
  private readonly installService = this.makeService(InstallService);

  async execute(
    _options: Record<string, never>,
  ): Promise<Result<readonly string[], string>> {
    const report = await this.installService.uninstall();
    const lines = [report.uninstalled ? UNINSTALL_BANNER : UNINSTALL_NOTHING_MESSAGE];
    if (report.uninstalled) lines.push(...report.actionLines);
    return { ok: true, value: lines };
  }
}
