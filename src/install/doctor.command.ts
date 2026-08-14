import type { DoctorArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome } from "../cli/CliOutcome.ts";
import { formatCwdResolution, formatRegistryStatus } from "../cli/format.ts";
import { resolveTargetWorkspaces } from "../cli/resolveTarget.service.ts";
import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { Container } from "../platform/container.ts";
import { defaultRegistryPath, loadRegistry } from "../workspace/registry.service.ts";
import { resolveWorkspace } from "../workspace/resolver.service.ts";
import { gatherDoctorReport, renderDoctorReport } from "./doctor.service.ts";

/**
 * `cmd_doctor` (`bin/memory:212-250`), REPLACED (not merely ported) per
 * [[services]]/packet-9-install: Python's version spawns the 5 real hook
 * scripts and reports their exit codes — a smoke test this repo can no
 * longer run as-is (P7's TypeScript hook handlers land in a parallel packet
 * and don't exist in this worktree), so `bin/memory:212-250` is not usable
 * as a line-by-line port target here. Rather than fabricate a fake spawn
 * against a script this packet never wrote, doctor now does what the plan's
 * `[[services]]` doc actually asks for: real diagnostics against the state
 * an install depends on (registry, every workspace's vault + index,
 * `settings.json`'s hook registrations, the recorded `bun` binary, the
 * launchd job, log sizes) — see `doctor.service.ts`'s doc comment.
 *
 * The first two lines — registry status, cwd resolution — stay
 * BYTE-IDENTICAL to Python (and to this file's own former stub), because the
 * `cli/doctor-*` parity cases anchor on exactly those two lines even while
 * skipped ([[testing]]).
 */
export async function doctor(
  container: Container,
  args: DoctorArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryPath = defaultRegistryPath(home);
  const registryResult = await loadRegistry(container.fs, registryPath);
  const registryStatus =
    registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";
  container.stdio.write(formatRegistryStatus(registryPath, registryStatus));

  const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
  const raws = registryResult.ok ? registryResult.value : [];
  const workspace = resolveWorkspace(raws, cwd, home);
  container.stdio.write(
    formatCwdResolution(cwd, workspace !== null ? workspace.id : "no workspace"),
  );

  const targets = resolveTargetWorkspaces(raws, home, null);
  const workspaces = targets.ok ? targets.value : [];
  const report = await gatherDoctorReport(container, workspaces, {
    repoRoot: repoRootFromRunningFile(),
    registryError: registryResult.ok ? null : registryResult.error,
  });
  for (const line of renderDoctorReport(report)) container.stdio.write(line);

  return CLI_SUCCESS;
}

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
