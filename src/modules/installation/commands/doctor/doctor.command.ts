import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { DOCTOR_DESCRIPTOR } from "@/modules/installation/commands/doctor/doctor.constants.ts";
import { DoctorFormatter } from "@/modules/installation/doctor/doctor.formatter.ts";
import { DoctorService } from "@/modules/installation/doctor/doctor.useCase.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

export type DoctorOptions = {
  readonly cwd: string | null;
  readonly prompt: string | null;
};

@Command(DOCTOR_DESCRIPTOR)
export class DoctorCommand implements CommandContract<DoctorOptions> {
  constructor(
    private readonly container: Gateways,
    private readonly doctorService: DoctorService,
    private readonly formatter: DoctorFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<DoctorOptions, ArgsError> {
    const cwd = tokens.includes("--cwd")
      ? (tokens[tokens.indexOf("--cwd") + 1] ?? null)
      : null;
    const prompt = tokens.includes("--prompt")
      ? (tokens[tokens.indexOf("--prompt") + 1] ?? null)
      : null;
    return { ok: true, value: { cwd, prompt } };
  }

  async run(options: DoctorOptions, context: RunContext): Promise<CommandResult> {
    const home = context.home;
    const { repository, resolverService, targetResolutionService } = makeWorkspaceContext(
      this.container.fs,
      this.container.git,
      this.container.proc,
    );
    const registryPath = repository.defaultPath(home);
    const registryResult = await repository.load(registryPath);
    const registryStatus =
      registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";

    const cwd = options.cwd !== null ? expandPath(options.cwd, home) : context.cwd;
    const raws = registryResult.ok ? registryResult.value : [];
    const workspace = resolverService.resolveWorkspace(raws, cwd, home);

    const targets = targetResolutionService.resolveTargetWorkspaces(raws, home, null);
    const workspaces = targets.ok ? targets.value : [];
    const report = await this.doctorService.gatherReport(workspaces, {
      repoRoot: this.container.env.repoRoot(),
      registryError: registryResult.ok ? null : registryResult.error,
    });

    return {
      lines: [
        this.formatter.formatRegistryStatus(registryPath, registryStatus),
        this.formatter.formatCwdResolution(
          cwd,
          workspace !== null ? workspace.id : "no workspace",
        ),
        ...this.formatter.render(report),
      ],
      ...CLI_SUCCESS,
    };
  }
}
