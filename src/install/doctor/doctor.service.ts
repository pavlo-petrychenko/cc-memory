import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import {
  CCMEM_LOG_HOME_RELATIVE_PATH,
  LOG_SIZE_WARNING_BYTES,
} from "@/install/doctor/doctor.constants.ts";
import type {
  DoctorReport,
  GatherDoctorReportOptions,
  HookRegistrationDiagnostic,
  WorkspaceDiagnostic,
} from "@/install/doctor/doctor.typedefs.ts";
import { WorkspaceIndexStatus } from "@/install/doctor/doctor.typedefs.ts";
import { InstallService } from "@/install/install.service.ts";
import { ManifestService } from "@/install/steps/manifest/index.ts";
import {
  HOOK_REGISTRATION_ORDER,
  SettingsService,
} from "@/install/steps/settings/index.ts";
import { JsonFileService, type JsonObject } from "@/install/utils/jsonFile/index.ts";
import type { Container } from "@/platform/index.ts";
import { IndexBuildService } from "@/retrieval/index.ts";

/**
 * `memory doctor` checks the state a healthy install actually depends on: the
 * registry, every workspace's vault + index, `settings.json`'s hook
 * registrations, the recorded `bun` binary, and file sizes
 * that tend to grow unbounded.
 *
 * `doctor.command.ts` keeps printing the original two lines (registry status,
 * cwd resolution) byte-for-byte via `cli/format.ts`'s existing renderers
 * before calling into this class — those two lines are anchored by tests.
 */
export class DoctorService {
  constructor(
    private readonly container: Container,
    private readonly indexBuildService: IndexBuildService = new IndexBuildService(),
  ) {}

  private async fileSizeOrZero(path: AbsPath): Promise<number> {
    try {
      const stat = await this.container.fs.stat(path);
      return stat.isFile ? stat.size : 0;
    } catch {
      return 0;
    }
  }

  /** The parent directory of an already-absolute, normalized `AbsPath` — see
   * `registry.service.ts`'s `parentDir` doc comment. */
  private static parentDirectory(path: AbsPath): AbsPath {
    const lastSlashIndex = path.lastIndexOf("/");
    const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
    // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
    // another absolute, normalized path (or the root `/`).
    return sliced as AbsPath;
  }

  private static joinFixedSegment(base: AbsPath, segment: string): AbsPath {
    // SAFETY: every call site below passes a hard-coded segment with no `/`,
    // `.` or `..` of its own (`wrap-state.json`, `inject.jsonl`).
    return `${base}/${segment}` as AbsPath;
  }

  private async isRealDirectory(path: AbsPath): Promise<boolean> {
    try {
      return (await this.container.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  /** One workspace's health: vault directories, then a REAL incremental
   * reindex (`IndexBuildService.build(..., { incremental: true })`) — the same safe,
   * idempotent operation `memory reindex` and every `SessionStart` already
   * perform — both to prove the index is reachable and to answer "stale":
   * `added+updated+removed > 0` means the on-disk vault had drifted from the
   * index before this doctor run caught it up. */
  private async diagnoseWorkspace(workspace: Workspace): Promise<WorkspaceDiagnostic> {
    const kbExists = await this.isRealDirectory(workspace.kb);
    const worklogsExist = await this.isRealDirectory(workspace.worklogs);

    const indexDirectory = DoctorService.parentDirectory(workspace.indexDb);
    const wrapStateBytes = await this.fileSizeOrZero(
      DoctorService.joinFixedSegment(indexDirectory, "wrap-state.json"),
    );
    const injectLogBytes = await this.fileSizeOrZero(
      DoctorService.joinFixedSegment(indexDirectory, "inject.jsonl"),
    );

    try {
      const stats = await this.indexBuildService.build(this.container, workspace, {
        incremental: true,
      });
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

  /** Every command string currently registered for `event` across ALL groups
   * (foreign groups included, harmlessly — `commandsInGroup` only reports
   * `command` fields, never mutates anything). */
  private static commandsForEvent(
    settingsHooks: JsonObject,
    event: string,
  ): readonly string[] {
    const groupsValue = settingsHooks[event];
    if (groupsValue === undefined || !JsonFileService.isArray(groupsValue)) return [];
    return groupsValue.flatMap((group) => SettingsService.commandsInGroup(group));
  }

  async gatherReport(
    workspaces: readonly Workspace[],
    options: GatherDoctorReportOptions,
  ): Promise<DoctorReport> {
    const home = this.container.env.home();

    const workspaceDiagnostics = await Promise.all(
      workspaces.map((workspace) => this.diagnoseWorkspace(workspace)),
    );

    const manifestService = new ManifestService(this.container.fs);
    const settingsService = new SettingsService(this.container.fs);
    const manifest = await manifestService.load(ManifestService.defaultPath(home));
    const settingsResult = await settingsService.load(SettingsService.defaultPath(home));

    let hooks: readonly HookRegistrationDiagnostic[] | null = null;
    let recordedBunPath: string | null = null;
    let bunPathExists = false;

    if (manifest !== null) {
      recordedBunPath = manifest.bunPath;
      // SAFETY: `manifest.bunPath` is only ever written by `resolveBunPath`
      // (an `AbsPath`), round-tripped through JSON as a plain string.
      bunPathExists = await this.container.fs.exists(manifest.bunPath as AbsPath);

      const currentDistPath = InstallService.defaultDistPath(options.repoRoot);
      const settingsHooksField = settingsResult.ok
        ? settingsResult.value["hooks"]
        : undefined;
      const settingsHooks: JsonObject =
        settingsHooksField !== undefined && JsonFileService.isObject(settingsHooksField)
          ? settingsHooksField
          : {};
      hooks = HOOK_REGISTRATION_ORDER.map((registration) => {
        const expectedCommand = SettingsService.hookCommand(
          manifest.bunPath,
          currentDistPath,
          registration.name,
        );
        const registeredCommands = DoctorService.commandsForEvent(
          settingsHooks,
          registration.event,
        );
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
    const logSizeBytes = await this.fileSizeOrZero(logPath);

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
}
