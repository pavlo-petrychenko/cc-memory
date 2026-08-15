import type { DoctorReport } from "@/install/doctor/doctor.typedefs.ts";
import { WorkspaceIndexStatus } from "@/install/doctor/doctor.typedefs.ts";

/** Pure formatting for every line below `doctor.command.ts`'s two byte-frozen lines. */
export class DoctorFormatter {
  // A non-empty constructor keeps bun's coverage report from counting an
  // unreachable synthetic default constructor against this class.

  formatRegistryStatus(registryPath: string, status: string): string {
    return `registry: ${registryPath} ${status}`;
  }

  formatCwdResolution(cwd: string, resolvedIdOrNoWorkspace: string): string {
    return `cwd ${cwd} -> ${resolvedIdOrNoWorkspace}`;
  }

  render(report: DoctorReport): readonly string[] {
    const lines: string[] = [];

    if (report.registryErrorMessage !== null) {
      lines.push(`registry error: ${report.registryErrorMessage}`);
    }

    for (const workspace of report.workspaces) {
      lines.push(`workspace ${workspace.id}:`);
      lines.push(`  kb: ${workspace.kbExists ? "ok" : "MISSING"}`);
      lines.push(`  worklogs: ${workspace.worklogsExist ? "ok" : "MISSING"}`);
      lines.push(
        workspace.indexStatus === WorkspaceIndexStatus.Unreachable
          ? "  index: UNREACHABLE"
          : `  index: ${workspace.indexStatus} (${String(workspace.noteCount)} notes)`,
      );
      lines.push(`  wrap-state.json: ${String(workspace.wrapStateBytes)} bytes`);
      lines.push(`  inject.jsonl: ${String(workspace.injectLogBytes)} bytes`);
    }

    if (report.hooks === null) {
      lines.push("install: not installed (no installed.json manifest found)");
    } else {
      lines.push(
        `bun: ${report.recordedBunPath ?? "?"} (${report.bunPathExists ? "ok" : "MISSING"})`,
      );
      for (const hook of report.hooks) {
        lines.push(`hook ${hook.event}: ${hook.upToDate ? "ok" : "STALE"}`);
      }
      lines.push();
    }

    lines.push(
      `ccmem.log: ${String(report.logSizeBytes)} bytes${report.logOversized ? " (OVERSIZED)" : ""}`,
    );

    return lines;
  }
}
