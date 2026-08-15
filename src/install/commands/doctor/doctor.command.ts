import { CLI_SUCCESS } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { DoctorArgs } from "@/install/commands/doctor/doctor.typedefs.ts";
import { DoctorFormatter } from "@/install/doctor/doctor.formatter.ts";
import { DoctorService } from "@/install/doctor/doctor.service.ts";
import type { Container } from "@/platform/index.ts";
import {
  defaultRegistryPath,
  loadRegistry,
  RegistryService,
  RegistryTomlSerializer,
  TargetResolutionService,
  WorkspaceResolverService,
} from "@/workspace/index.ts";

/** `memory doctor`'s CLI surface. The first two printed lines — registry status,
 * cwd resolution — must stay byte-identical across changes; tests anchor on them. */
export class DoctorCommand {
  constructor(
    private readonly container: Container,
    private readonly doctorService: DoctorService,
    private readonly formatter: DoctorFormatter,
  ) {}

  async execute(args: DoctorArgs): Promise<CliOutcome> {
    const home = this.container.env.home();
    const registryPath = defaultRegistryPath(home);
    const registryResult = await loadRegistry(this.container.fs, registryPath);
    const registryStatus =
      registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";
    this.container.stdio.write(
      this.formatter.formatRegistryStatus(registryPath, registryStatus),
    );

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : this.container.env.cwd();
    const raws = registryResult.ok ? registryResult.value : [];
    const registryService = new RegistryService(
      this.container.fs,
      new RegistryTomlSerializer(),
    );
    const resolverService = new WorkspaceResolverService(
      registryService,
      this.container.git,
    );
    const workspace = resolverService.resolveWorkspace(raws, cwd, home);
    this.container.stdio.write(
      this.formatter.formatCwdResolution(
        cwd,
        workspace !== null ? workspace.id : "no workspace",
      ),
    );

    const targetResolutionService = new TargetResolutionService(
      registryService,
      resolverService,
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
