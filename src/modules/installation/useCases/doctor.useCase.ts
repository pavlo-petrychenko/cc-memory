import { UseCase } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { DoctorFormatter } from "@/modules/installation/doctor/doctor.formatter.ts";
import { DoctorService } from "@/modules/installation/services/doctor.service.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";

export type DoctorOptions = {
  readonly cwd: string | null;
  readonly prompt: string | null;
};

/** One user-facing operation: diagnose the install and render a report. */
export class DoctorUseCase extends UseCase<
  DoctorOptions,
  Result<readonly string[], string>
> {
  private readonly doctorService = this.makeService(DoctorService);
  private readonly repository = this.makeRepository(WorkspaceRepository);
  private readonly targetResolution = this.makeService(TargetResolutionService);
  private readonly formatter = new DoctorFormatter();

  async execute(options: DoctorOptions): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const registryPath = this.repository.defaultPath(home);
    const registryResult = await this.repository.load(registryPath);
    const registryStatus =
      registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";

    const cwd =
      options.cwd !== null ? expandPath(options.cwd, home) : this.gateways.env.cwd();
    const raws = registryResult.ok ? registryResult.value : [];
    const workspaceResult = this.targetResolution.resolveWorkspaceForCwd(
      raws,
      home,
      cwd,
      null,
    );
    const workspaceId = workspaceResult.ok ? workspaceResult.value.id : "no workspace";

    const targets = this.targetResolution.resolveTargetWorkspaces(raws, home, null);
    const workspaces = targets.ok ? targets.value : [];
    const report = await this.doctorService.gatherReport(workspaces, {
      repoRoot: this.gateways.env.repoRoot(),
      registryError: registryResult.ok ? null : registryResult.error,
    });

    return {
      ok: true,
      value: [
        this.formatter.formatRegistryStatus(registryPath, registryStatus),
        this.formatter.formatCwdResolution(cwd, workspaceId),
        ...this.formatter.render(report),
      ],
    };
  }
}
