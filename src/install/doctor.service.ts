import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { buildIndex } from "../retrieval/build.service.ts";
import type { RegistryError } from "../workspace/registry.service.ts";
import { isJsonArray, isJsonObject, type JsonObject } from "./json.service.ts";
import { defaultManifestPath, loadManifest } from "./manifest.service.ts";
import { defaultDistPath } from "./run.service.ts";
import {
  commandsInGroup,
  defaultSettingsPath,
  hookCommand,
  HOOK_REGISTRATION_ORDER,
  loadSettings,
} from "./settings.service.ts";

/**
 * `memory doctor` checks the state a healthy install actually depends on: the
 * registry, every workspace's vault + index, `settings.json`'s hook
 * registrations, the recorded `bun` binary, and file sizes
 * that tend to grow unbounded.
 *
 * `doctor.command.ts` keeps printing the original two lines (registry status,
 * cwd resolution) byte-for-byte via `format.ts`'s existing renderers before
 * calling into this file — those two lines are anchored by tests.
 */

// Matches `logger.adapter.ts`'s private `MAX_LOG_BYTES` — that
// constant isn't exported (single call site there), so this is a linked
// duplicate rather than a new, independently-chosen threshold.
const LOG_SIZE_WARNING_BYTES = 1_048_576;

const CCMEM_LOG_HOME_RELATIVE_PATH = "~/.claude/memory/ccmem.log";

async function fileSizeOrZero(container: Container, path: AbsPath): Promise<number> {
  try {
    const stat = await container.fs.stat(path);
    return stat.isFile ? stat.size : 0;
  } catch {
    return 0;
  }
}

/** The parent directory of an already-absolute, normalized `AbsPath` — see
 * `registry.service.ts`'s `parentDir` doc comment. */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path (or the root `/`).
  return sliced as AbsPath;
}

function joinFixedSegment(base: AbsPath, segment: string): AbsPath {
  // SAFETY: every call site below passes a hard-coded segment with no `/`,
  // `.` or `..` of its own (`wrap-state.json`, `inject.jsonl`).
  return `${base}/${segment}` as AbsPath;
}

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

async function isRealDirectory(container: Container, path: AbsPath): Promise<boolean> {
  try {
    return (await container.fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

/** One workspace's health: vault directories, then a REAL incremental
 * reindex (`buildIndex(..., { incremental: true })`) — the same safe,
 * idempotent operation `memory reindex` and every `SessionStart` already
 * perform — both to prove the index is reachable and to answer "stale":
 * `added+updated+removed > 0` means the on-disk vault had drifted from the
 * index before this doctor run caught it up. */
async function diagnoseWorkspace(
  container: Container,
  workspace: Workspace,
): Promise<WorkspaceDiagnostic> {
  const kbExists = await isRealDirectory(container, workspace.kb);
  const worklogsExist = await isRealDirectory(container, workspace.worklogs);

  const indexDirectory = parentDirectory(workspace.indexDb);
  const wrapStateBytes = await fileSizeOrZero(
    container,
    joinFixedSegment(indexDirectory, "wrap-state.json"),
  );
  const injectLogBytes = await fileSizeOrZero(
    container,
    joinFixedSegment(indexDirectory, "inject.jsonl"),
  );

  try {
    const stats = await buildIndex(container, workspace, { incremental: true });
    const drifted = stats.added > 0 || stats.updated > 0 || stats.removed > 0;
    return {
      id: workspace.id,
      kbExists,
      worklogsExist,
      indexStatus: drifted ? WorkspaceIndexStatus.Stale : WorkspaceIndexStatus.Ok,
      noteCount: stats.total,
      wrapStateBytes,
      injectLogBytes,
    };
  } catch {
    return {
      id: workspace.id,
      kbExists,
      worklogsExist,
      indexStatus: WorkspaceIndexStatus.Unreachable,
      noteCount: null,
      wrapStateBytes,
      injectLogBytes,
    };
  }
}

export type HookRegistrationDiagnostic = {
  readonly event: string;
  readonly hookName: string;
  readonly registeredCommands: readonly string[];
  readonly expectedCommand: string;
  readonly upToDate: boolean;
};

/** Every command string currently registered for `event` across ALL groups
 * (foreign groups included, harmlessly — `commandsInGroup` only reports
 * `command` fields, never mutates anything). */
function commandsForEvent(settingsHooks: JsonObject, event: string): readonly string[] {
  const groupsValue = settingsHooks[event];
  if (groupsValue === undefined || !isJsonArray(groupsValue)) return [];
  return groupsValue.flatMap((group) => commandsInGroup(group));
}

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

export async function gatherDoctorReport(
  container: Container,
  workspaces: readonly Workspace[],
  options: GatherDoctorReportOptions,
): Promise<DoctorReport> {
  const home = container.env.home();

  const workspaceDiagnostics = await Promise.all(
    workspaces.map((workspace) => diagnoseWorkspace(container, workspace)),
  );

  const manifest = await loadManifest(container.fs, defaultManifestPath(home));
  const settingsResult = await loadSettings(container.fs, defaultSettingsPath(home));

  let hooks: readonly HookRegistrationDiagnostic[] | null = null;
  let recordedBunPath: string | null = null;
  let bunPathExists = false;

  if (manifest !== null) {
    recordedBunPath = manifest.bunPath;
    // SAFETY: `manifest.bunPath` is only ever written by `resolveBunPath`
    // (an `AbsPath`), round-tripped through JSON as a plain string.
    bunPathExists = await container.fs.exists(manifest.bunPath as AbsPath);

    const currentDistPath = defaultDistPath(options.repoRoot);
    const settingsHooksField = settingsResult.ok
      ? settingsResult.value["hooks"]
      : undefined;
    const settingsHooks: JsonObject =
      settingsHooksField !== undefined && isJsonObject(settingsHooksField)
        ? settingsHooksField
        : {};
    hooks = HOOK_REGISTRATION_ORDER.map((registration) => {
      const expectedCommand = hookCommand(
        manifest.bunPath,
        currentDistPath,
        registration.name,
      );
      const registeredCommands = commandsForEvent(settingsHooks, registration.event);
      return {
        event: registration.event,
        hookName: registration.name,
        registeredCommands,
        expectedCommand,
        upToDate: registeredCommands.includes(expectedCommand),
      };
    });
  }

  const logPath = expandPath(CCMEM_LOG_HOME_RELATIVE_PATH, home);
  const logSizeBytes = await fileSizeOrZero(container, logPath);

  return {
    workspaces: workspaceDiagnostics,
    hooks,
    recordedBunPath,
    bunPathExists,
    logSizeBytes,
    logOversized: logSizeBytes > LOG_SIZE_WARNING_BYTES,
    registryErrorMessage:
      options.registryError !== null ? options.registryError.message : null,
  };
}

/** Pure formatting — every line below `doctor.command.ts`'s two byte-frozen
 * lines. The wording here is free to change; only the two lines this file
 * never touches are pinned. */
export function renderDoctorReport(report: DoctorReport): readonly string[] {
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
