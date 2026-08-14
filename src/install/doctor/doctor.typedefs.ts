import type { AbsPath } from "@/core/index.ts";
import type { RegistryError } from "@/workspace/index.ts";

export enum WorkspaceIndexStatus {
  Ok = "ok",
  Stale = "stale",
  Unreachable = "unreachable",
}

export type WorkspaceDiagnostic = {
  readonly id: string;
  readonly kbExists: boolean;
  readonly worklogsExist: boolean;
  readonly indexStatus: WorkspaceIndexStatus;
  readonly noteCount: number | null;
  readonly wrapStateBytes: number;
  readonly injectLogBytes: number;
};

export type HookRegistrationDiagnostic = {
  readonly event: string;
  readonly hookName: string;
  readonly registeredCommands: readonly string[];
  readonly expectedCommand: string;
  readonly upToDate: boolean;
};

export type DoctorReport = {
  readonly workspaces: readonly WorkspaceDiagnostic[];
  /** `null` when there is no `installed.json` manifest at all — doctor has
   * nothing recorded to compare `settings.json` or `bun` against yet. */
  readonly hooks: readonly HookRegistrationDiagnostic[] | null;
  readonly recordedBunPath: string | null;
  readonly bunPathExists: boolean;
  readonly logSizeBytes: number;
  readonly logOversized: boolean;
  readonly registryErrorMessage: string | null;
};

export type GatherDoctorReportOptions = {
  readonly repoRoot: AbsPath;
  readonly registryError: RegistryError | null;
};
