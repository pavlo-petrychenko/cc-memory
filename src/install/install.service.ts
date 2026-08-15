import type { AbsPath } from "@/core/index.ts";
import { absPath, joinAbs } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  DIST_RELATIVE_PATH,
  SKILLS_SOURCE_RELATIVE_PATH,
} from "@/install/install.constants.ts";
import {
  type InstallError,
  InstallErrorKind,
  type InstallOptions,
  type InstallReport,
  type UninstallReport,
} from "@/install/install.typedefs.ts";
import { BunPathService } from "@/install/steps/bunPath/bunPath.service.ts";
import {
  type BunPathError,
  BunPathErrorKind,
} from "@/install/steps/bunPath/bunPath.typedefs.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  PRE_CCMEMORY_BACKUP_SUFFIX,
} from "@/install/steps/manifest/manifest.constants.ts";
import { ManifestService } from "@/install/steps/manifest/manifest.service.ts";
import type { InstalledManifest } from "@/install/steps/manifest/manifest.typedefs.ts";
import { SeedService } from "@/install/steps/seed/seed.service.ts";
import { HOOK_REGISTRATION_ORDER } from "@/install/steps/settings/settings.constants.ts";
import { SettingsService } from "@/install/steps/settings/settings.service.ts";
import { ShimService } from "@/install/steps/shim/shim.service.ts";
import { SkillsService } from "@/install/steps/skills/skills.service.ts";
import { JsonFileService } from "@/install/utils/jsonFile/jsonFile.service.ts";
import {
  type JsonFileError,
  JsonFileErrorKind,
  type JsonObject,
  type JsonValue,
} from "@/install/utils/jsonFile/jsonFile.typedefs.ts";
import type { Container } from "@/platform/index.ts";
import { defaultRegistryPath } from "@/workspace/index.ts";

/** `install`/`uninstall`/`--dry-run` orchestration: sequences CLI shim, skills,
 * hooks, and registry seed, in that order. */
export class InstallService {
  constructor(private readonly container: Container) {}

  static defaultDistPath(repoRoot: AbsPath): AbsPath {
    return joinAbs(repoRoot, DIST_RELATIVE_PATH);
  }

  static defaultSkillsSourceDir(repoRoot: AbsPath): AbsPath {
    return joinAbs(repoRoot, SKILLS_SOURCE_RELATIVE_PATH);
  }

  private static bunPathErrorToInstallError(error: BunPathError): InstallError {
    return error.kind === BunPathErrorKind.NotFound
      ? { kind: InstallErrorKind.BunNotFound }
      : { kind: InstallErrorKind.BunUnresolvable, attemptedPath: error.attemptedPath };
  }

  /** Three cases: already backed up before (keep that path), backed up just now
   * (the fresh path), or never backed up (`null`). */
  private static resolveManifestBackupPath(
    alreadyBackedUp: boolean,
    didBackupJustNow: boolean,
    previousBackupPath: string | null,
    freshBackupPath: AbsPath,
  ): string | null {
    if (alreadyBackedUp) return previousBackupPath;
    if (didBackupJustNow) return freshBackupPath;
    return null;
  }

  private static settingsFileErrorMessage(error: JsonFileError): string {
    return error.kind === JsonFileErrorKind.ParseError
      ? `settings.json does not parse as JSON: ${error.message}`
      : "settings.json's top level is not an object";
  }

  private gatherHomePaths(repoRoot: AbsPath) {
    const home = this.container.env.home();
    return {
      home,
      distPath: InstallService.defaultDistPath(repoRoot),
      manifestPath: ManifestService.defaultPath(home),
      settingsPath: SettingsService.defaultPath(home),
      settingsBackupPath: SettingsService.defaultBackupPath(home),
      skillsSourceDir: InstallService.defaultSkillsSourceDir(repoRoot),
      skillsTargetDir: SkillsService.defaultTargetDir(home),
      shimPath: ShimService.defaultPath(home),
      registryPath: defaultRegistryPath(home),
    };
  }

  async install(options: InstallOptions): Promise<Result<InstallReport, InstallError>> {
    const { fs, proc } = this.container;
    const repoRoot = options.repoRoot;
    const paths = this.gatherHomePaths(repoRoot);

    const bunPathResult = await new BunPathService(proc, fs).resolve();
    if (!bunPathResult.ok) {
      return {
        ok: false,
        error: InstallService.bunPathErrorToInstallError(bunPathResult.error),
      };
    }
    const bunPath = bunPathResult.value;

    const manifestService = new ManifestService(fs);
    const settingsService = new SettingsService(fs);

    const previousManifest = await manifestService.load(paths.manifestPath);
    const manifestCommands = new Set(
      previousManifest !== null ? Object.values(previousManifest.hookCommands) : [],
    );
    const runLegacyPurge = previousManifest === null || !previousManifest.legacyPurgeDone;

    const settingsResult = await settingsService.load(paths.settingsPath);
    if (!settingsResult.ok) {
      return {
        ok: false,
        error: {
          kind: InstallErrorKind.SettingsUnreadable,
          message: InstallService.settingsFileErrorMessage(settingsResult.error),
        },
      };
    }
    const settingsBefore = settingsResult.value;
    const surgery = SettingsService.surgerize(
      settingsBefore,
      manifestCommands,
      runLegacyPurge,
      bunPath,
      paths.distPath,
    );
    const settingsDiffLines = SettingsService.diffLines(
      JsonFileService.stringify(settingsBefore),
      JsonFileService.stringify(surgery.settings),
    );

    const actionLines: string[] = [];
    const purgeLine = SettingsService.purgeSummaryLine(surgery.summary);
    if (purgeLine !== null) actionLines.push(purgeLine);
    for (const registration of HOOK_REGISTRATION_ORDER) {
      actionLines.push(
        SettingsService.hookRegisteredLine(registration.event, registration.name),
      );
    }

    const skillsService = new SkillsService(fs);
    const skillNames = await skillsService.discoverNames(paths.skillsSourceDir);
    const previousSkills = previousManifest?.skills ?? [];
    const registryExists = await fs.exists(paths.registryPath);

    if (options.dryRun) {
      for (const name of skillNames) actionLines.push(`skill ${name}`);
      actionLines.push(
        registryExists
          ? "registry exists (left as-is)"
          : `would seed registry -> ${paths.registryPath}`,
      );
      actionLines.push(`would write CLI shim -> ${paths.shimPath}`);
      return { ok: true, value: { dryRun: true, actionLines, settingsDiffLines } };
    }

    const alreadyBackedUpSettings =
      previousManifest !== null && previousManifest.settingsBackupPath !== null;
    const didBackupSettings = await settingsService.backupIfNeeded(
      paths.settingsPath,
      paths.settingsBackupPath,
      alreadyBackedUpSettings,
    );
    await settingsService.save(paths.settingsPath, surgery.settings);

    const skillsOutcome = await skillsService.install(
      paths.skillsSourceDir,
      paths.skillsTargetDir,
      skillNames,
      previousSkills,
    );
    actionLines.push(...skillsOutcome.actionLines);

    await new ShimService(fs).write(paths.shimPath, bunPath, paths.distPath);

    const seedOutcome = await new SeedService(fs).seed(repoRoot, paths.home);
    actionLines.push(seedOutcome.actionLine);

    const settingsBackupPathForManifest = InstallService.resolveManifestBackupPath(
      alreadyBackedUpSettings,
      didBackupSettings,
      previousManifest?.settingsBackupPath ?? null,
      paths.settingsBackupPath,
    );

    const nextManifest: InstalledManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot,
      bunPath,
      distPath: paths.distPath,
      hookCommands: surgery.hookCommands,
      shimPath: paths.shimPath,
      skills: skillsOutcome.skills,
      settingsBackupPath: settingsBackupPathForManifest,
      legacyPurgeDone: true,
    };
    await manifestService.save(paths.manifestPath, nextManifest);

    return { ok: true, value: { dryRun: false, actionLines, settingsDiffLines } };
  }

  /** Reverses exactly what the manifest records — registry and vault content are
   * never touched, since those are the user's data, not an installed artifact. */
  async uninstall(): Promise<UninstallReport> {
    const { fs } = this.container;
    const home = this.container.env.home();
    const manifestService = new ManifestService(fs);
    const settingsService = new SettingsService(fs);
    const manifestPath = ManifestService.defaultPath(home);
    const manifest = await manifestService.load(manifestPath);
    if (manifest === null) {
      return {
        uninstalled: false,
        actionLines: ["no installed.json manifest found; nothing to do"],
      };
    }

    const actionLines: string[] = [];

    const settingsPath = SettingsService.defaultPath(home);
    const settingsResult = await settingsService.load(settingsPath);
    if (settingsResult.ok) {
      const manifestCommands = new Set(Object.values(manifest.hookCommands));
      const existingHooksField = settingsResult.value["hooks"];
      const existingHooks =
        existingHooksField !== undefined && JsonFileService.isObject(existingHooksField)
          ? existingHooksField
          : {};
      const purged = InstallService.purgeHooksForUninstall(
        existingHooks,
        manifestCommands,
      );
      await settingsService.save(settingsPath, {
        ...settingsResult.value,
        hooks: purged,
      });
      actionLines.push("removed hook registrations from settings.json");
    }

    await fs.remove(absPath(manifest.shimPath));
    actionLines.push(`removed CLI shim -> ${manifest.shimPath}`);

    const skillsTargetDir = SkillsService.defaultTargetDir(home);
    await Promise.all(
      manifest.skills.map((skill) => this.restoreOneSkill(skillsTargetDir, skill)),
    );
    for (const skill of manifest.skills) actionLines.push(`removed skill ${skill.name}`);

    await fs.remove(manifestPath);
    actionLines.push("removed installed.json manifest");

    return { uninstalled: true, actionLines };
  }

  private async restoreOneSkill(
    skillsTargetDir: AbsPath,
    skill: { readonly name: string; readonly backedUp: boolean },
  ): Promise<void> {
    const targetPath = joinAbs(skillsTargetDir, skill.name);
    await this.container.fs.remove(targetPath);
    if (!skill.backedUp) return;
    const backupPath = absPath(`${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}`);
    if (await this.container.fs.exists(backupPath)) {
      await this.container.fs.rename(backupPath, targetPath);
    }
  }

  /** Manifest-only, no legacy substring fallback — uninstall must never remove a
   * foreign hook it never registered. */
  private static purgeHooksForUninstall(
    hooksByEvent: JsonObject,
    manifestCommands: ReadonlySet<string>,
  ): JsonObject {
    const kept: [string, JsonValue][] = [];
    for (const [event, groupsValue] of Object.entries(hooksByEvent)) {
      if (!JsonFileService.isArray(groupsValue)) {
        kept.push([event, groupsValue]);
        continue;
      }
      const remaining = groupsValue.filter(
        (group) =>
          !SettingsService.commandsInGroup(group).some((command) =>
            manifestCommands.has(command),
          ),
      );
      if (remaining.length > 0) kept.push([event, remaining]);
    }
    return Object.fromEntries(kept);
  }
}
