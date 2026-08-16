import type { AbsPath } from "@/core/index.ts";
import { absPath, joinAbs, logPath, parentDir } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { LOG_SIZE_WARNING_BYTES } from "@/modules/installation/doctor/doctor.constants.ts";
import type {
  DoctorReport,
  GatherDoctorReportOptions,
  HookRegistrationDiagnostic,
  WorkspaceDiagnostic,
} from "@/modules/installation/doctor/doctor.typedefs.ts";
import { WorkspaceIndexStatus } from "@/modules/installation/doctor/doctor.typedefs.ts";
import { InstallService } from "@/modules/installation/install.useCase.ts";
import { ManifestService } from "@/modules/installation/steps/manifest/manifest.repository.ts";
import { SettingsService } from "@/modules/installation/steps/settings/settings.repository.ts";
import { JsonFileService } from "@/modules/installation/utils/jsonFile/jsonFile.repository.ts";
import type { JsonObject } from "@/modules/installation/utils/jsonFile/jsonFile.typedefs.ts";
import type { ReprojectNotesUseCase } from "@/modules/note/index.ts";
import { HOOK_DESCRIPTORS } from "@/modules/session/session.constants.ts";
import type { ReprojectWorklogUseCase } from "@/modules/worklog/index.ts";

/** Checks the state a healthy install actually depends on: registry, vaults,
 * indexes, hook registrations, the recorded `bun` binary, log sizes. */
export class DoctorService {
  constructor(
    private readonly container: Gateways,
    private readonly reprojectNotes: ReprojectNotesUseCase,
    private readonly reprojectWorklog: ReprojectWorklogUseCase,
  ) {}

  private async fileSizeOrZero(path: AbsPath): Promise<number> {
    try {
      const stat = await this.container.fs.stat(path);
      return stat.isFile ? stat.size : 0;
    } catch {
      return 0;
    }
  }

  private async isRealDirectory(path: AbsPath): Promise<boolean> {
    try {
      return (await this.container.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  /** A REAL incremental reindex, both to prove the index is reachable and to
   * answer "stale": `added+updated+removed > 0` means the vault had drifted. */
  private async diagnoseWorkspace(workspace: Workspace): Promise<WorkspaceDiagnostic> {
    const kbExists = await this.isRealDirectory(workspace.kb);
    const worklogsExist = await this.isRealDirectory(workspace.worklogs);

    const indexDirectory = parentDir(workspace.indexDb);
    const wrapStateBytes = await this.fileSizeOrZero(
      joinAbs(indexDirectory, "wrap-state.json"),
    );
    const injectLogBytes = await this.fileSizeOrZero(
      joinAbs(indexDirectory, "inject.jsonl"),
    );

    try {
      const stats = await this.reprojectNotes.run(workspace, { incremental: true });
      await this.reprojectWorklog.run(workspace);
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
      bunPathExists = await this.container.fs.exists(absPath(manifest.bunPath));

      const currentDistPath = InstallService.defaultDistPath(options.repoRoot);
      const settingsHooksField = settingsResult.ok
        ? settingsResult.value["hooks"]
        : undefined;
      const settingsHooks: JsonObject =
        settingsHooksField !== undefined && JsonFileService.isObject(settingsHooksField)
          ? settingsHooksField
          : {};
      hooks = HOOK_DESCRIPTORS.map((registration) => {
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

    const logSizeBytes = await this.fileSizeOrZero(logPath(home));

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
