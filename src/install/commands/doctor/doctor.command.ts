import type { DoctorArgs } from "@/cli/index.ts";
import { CLI_SUCCESS } from "@/core/index.ts";
import type { AbsPath, CliOutcome } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import { DoctorFormatter, DoctorService } from "@/install/doctor/index.ts";
import type { Container } from "@/platform/index.ts";
import { resolveTargetWorkspaces } from "@/workspace/index.ts";
import { defaultRegistryPath, loadRegistry } from "@/workspace/index.ts";
import { resolveWorkspace } from "@/workspace/index.ts";

/**
 * `<repoRoot>/dist/memory.js` is exactly two path segments below the repo
 * root, and `import.meta.url` resolves to the URL of the FINAL bundle at
 * runtime regardless of which original source file references it (verified
 * against `bun build`'s actual output — a single-file bundle has exactly one
 * real module, so every `import.meta.url` inside it agrees). Duplicated in
 * `install.command.ts` rather than shared, matching this codebase's own
 * convention for a tiny path-only helper (see `workspace.command.ts`'s
 * `parentDirectory` doc comment).
 */
function repoRootFromRunningFile(): AbsPath {
  const runningFilePath = new URL(import.meta.url).pathname;
  const distDir = runningFilePath.slice(0, runningFilePath.lastIndexOf("/"));
  const repoRoot = distDir.slice(0, distDir.lastIndexOf("/"));
  // SAFETY: `dist/memory.js` is always written two path segments below the
  // repo root by `bun run build` — see the doc comment above.
  return repoRoot as AbsPath;
}

/**
 * `memory doctor` runs real diagnostics against the state an install depends
 * on: registry, every workspace's vault + index, `settings.json`'s hook
 * registrations, the recorded `bun` binary, log sizes — see
 * `doctor/doctor.service.ts`'s doc comment.
 *
 * The first two lines — registry status, cwd resolution — must stay
 * byte-identical across changes, since tests anchor on exactly those two
 * lines.
 */
export class DoctorCommand {
  constructor(private readonly container: Container) {}

  async execute(args: DoctorArgs): Promise<CliOutcome> {
    const formatter = new DoctorFormatter();
    const home = this.container.env.home();
    const registryPath = defaultRegistryPath(home);
    const registryResult = await loadRegistry(this.container.fs, registryPath);
    const registryStatus =
      registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";
    this.container.stdio.write(
      formatter.formatRegistryStatus(registryPath, registryStatus),
    );

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : this.container.env.cwd();
    const raws = registryResult.ok ? registryResult.value : [];
    const workspace = resolveWorkspace(raws, cwd, home);
    this.container.stdio.write(
      formatter.formatCwdResolution(
        cwd,
        workspace !== null ? workspace.id : "no workspace",
      ),
    );

    const targets = resolveTargetWorkspaces(raws, home, null);
    const workspaces = targets.ok ? targets.value : [];
    const report = await new DoctorService(this.container).gatherReport(workspaces, {
      repoRoot: repoRootFromRunningFile(),
      registryError: registryResult.ok ? null : registryResult.error,
    });
    for (const line of formatter.render(report)) {
      this.container.stdio.write(line);
    }

    return CLI_SUCCESS;
  }
}

/** Thin, signature-preserving delegate to `DoctorCommand` — `cli/main.ts`
 * dispatches to a plain function with this exact signature. */
export async function doctor(
  container: Container,
  args: DoctorArgs,
): Promise<CliOutcome> {
  return new DoctorCommand(container).execute(args);
}
