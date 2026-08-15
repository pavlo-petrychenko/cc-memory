import { CLI_SUCCESS } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import type { DoctorArgs } from "@/modules/installation/commands/doctor/doctor.typedefs.ts";
import { DoctorFormatter } from "@/modules/installation/doctor/doctor.formatter.ts";
import { DoctorService } from "@/modules/installation/doctor/doctor.service.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

/** `memory doctor`'s CLI surface. The first two printed lines — registry status,
 * cwd resolution — must stay byte-identical across changes; tests anchor on them. */
export class DoctorCommand {
  constructor(
    private readonly container: Gateways,
    private readonly doctorService: DoctorService,
    private readonly formatter: DoctorFormatter,
  ) {}

  async execute(args: DoctorArgs): Promise<CliOutcome> {
    const home = this.container.env.home();
    const { repository, resolverService, targetResolutionService } = makeWorkspaceContext(
      this.container.fs,
      this.container.git,
    );
    const registryPath = repository.defaultPath(home);
    const registryResult = await repository.load(registryPath);
    const registryStatus =
      registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";
    this.container.stdio.write(
      this.formatter.formatRegistryStatus(registryPath, registryStatus),
    );

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : this.container.env.cwd();
    const raws = registryResult.ok ? registryResult.value : [];
    const workspace = resolverService.resolveWorkspace(raws, cwd, home);
    this.container.stdio.write(
      this.formatter.formatCwdResolution(
        cwd,
        workspace !== null ? workspace.id : "no workspace",
      ),
    );

    const targets = targetResolutionService.resolveTargetWorkspaces(raws, home, null);
    const workspaces = targets.ok ? targets.value : [];
    const report = await this.doctorService.gatherReport(workspaces, {
      repoRoot: this.container.env.repoRoot(),
      registryError: registryResult.ok ? null : registryResult.error,
    });
    for (const line of this.formatter.render(report)) {
      this.container.stdio.write(line);
    }

    return CLI_SUCCESS;
  }
}
