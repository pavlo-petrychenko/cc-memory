import type { AbsPath } from "@/core/index.ts";
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
import {
  type BunPathError,
  BunPathErrorKind,
  BunPathService,
} from "@/install/steps/bunPath/index.ts";
import {
  type InstalledManifest,
  ManifestService,
  MANIFEST_SCHEMA_VERSION,
  PRE_CCMEMORY_BACKUP_SUFFIX,
} from "@/install/steps/manifest/index.ts";
import { SeedService } from "@/install/steps/seed/index.ts";
import {
  HOOK_REGISTRATION_ORDER,
  SettingsService,
} from "@/install/steps/settings/index.ts";
import { ShimService } from "@/install/steps/shim/index.ts";
import { SkillsService } from "@/install/steps/skills/index.ts";
import {
  type JsonFileError,
  JsonFileErrorKind,
  JsonFileService,
  type JsonObject,
  type JsonValue,
} from "@/install/utils/jsonFile/index.ts";
import type { Container } from "@/platform/index.ts";
import { defaultRegistryPath } from "@/workspace/index.ts";

/**
 * `install`/`uninstall`/`--dry-run` orchestration. Every step above this
 * file is deliberately small and independently testable; this class is the
 * one place that sequences them: CLI shim, skills, hooks, registry seed —
 * in that order.
 */
export class InstallService {
  constructor(private readonly container: Container) {}

  static defaultDistPath(repoRoot: AbsPath): AbsPath {
    // SAFETY: appending a fixed literal relative path onto an
    // already-absolute, normalized `repoRoot`.
    return `${repoRoot}/${DIST_RELATIVE_PATH}` as AbsPath;
  }

  static defaultSkillsSourceDir(repoRoot: AbsPath): AbsPath {
    // SAFETY: same reasoning as `defaultDistPath` above.
    return `${repoRoot}/${SKILLS_SOURCE_RELATIVE_PATH}` as AbsPath;
  }

  private static bunPathErrorToInstallError(error: BunPathError): InstallError {
    return error.kind === BunPathErrorKind.NotFound
      ? { kind: InstallErrorKind.BunNotFound }
      : { kind: InstallErrorKind.BunUnresolvable, attemptedPath: error.attemptedPath };
  }

  /** The `settingsBackupPath` to record in the manifest after this run —
   * kept as its own `if`/`else` (not a nested ternary, which lint forbids)
   * since it has to cover three distinct cases: already backed up before
   * (keep that path), backed up just now (the fresh path), or never backed
   * up because `settings.json` didn't exist yet (`null`). */
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

  /**
   * Everything `install`/`uninstall` need to identify their own artifacts
   * later, kept together so this class's two entry points don't repeat the
   * same five `default*Path` calls with subtly different arguments.
   */
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

  /** `install [--dry-run]` — resolve `bun`, compute the `settings.json`
   * surgery, then either report it (`dryRun`) or apply every write in
   * order: CLI shim, skills, hooks, registry seed. */
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

  /**
   * `uninstall` — reverses exactly what the manifest records: purge our hook
   * groups from `settings.json` (by exact former command, never the legacy
   * substring — uninstall never touches anything it didn't itself register),
   * remove the shim, remove/restore each skill,
   * then delete the manifest itself. Registry and vault content are never
   * touched — those are the user's data, not an installed artifact.
   */
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

    // SAFETY: `manifest.shimPath` is only ever written by `ShimService.defaultPath`
    // (an `AbsPath`), round-tripped through JSON as a plain string.
    await fs.remove(manifest.shimPath as AbsPath);
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
    // SAFETY: `skill.name` is one of the directory names `SkillsService.discoverNames`
    // (`FileSystem.readDir`) returned when this skill was installed.
    const targetPath = `${skillsTargetDir}/${skill.name}` as AbsPath;
    await this.container.fs.remove(targetPath);
    if (!skill.backedUp) return;
    // SAFETY: same literal-suffix reasoning as `skills.service.ts`'s `backupPathFor`.
    const backupPath = `${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath;
    if (await this.container.fs.exists(backupPath)) {
      await this.container.fs.rename(backupPath, targetPath);
    }
  }

  /** Uninstall's own hook purge: manifest-only, no legacy substring fallback
   * (uninstall must never remove a foreign hook it never registered). Reuses
   * `SettingsService.commandsInGroup` — the one piece of shape-reading logic
   * — rather than re-deciding "what's inside a hook group" a second time. */
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
