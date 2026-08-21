import { Service } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { absPath, expandPath, joinAbs } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { registryPath } from "@/core/index.ts";
import { HOOK_DESCRIPTORS } from "@/core/transport/hook/hook.constants.ts";
import {
  DIST_RELATIVE_PATH,
  PI_EXTENSION_DIST_RELATIVE_PATH,
  SKILLS_SOURCE_RELATIVE_PATH,
} from "@/modules/installation/install.constants.ts";
import {
  AgentTarget,
  type InstallError,
  InstallErrorKind,
  type InstallOptions,
  type InstallReport,
  type UninstallReport,
} from "@/modules/installation/install.typedefs.ts";
import { BunPathService } from "@/modules/installation/steps/bunPath/bunPath.repository.ts";
import {
  type BunPathError,
  BunPathErrorKind,
} from "@/modules/installation/steps/bunPath/bunPath.typedefs.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  PRE_CCMEMORY_BACKUP_SUFFIX,
} from "@/modules/installation/steps/manifest/manifest.constants.ts";
import { ManifestService } from "@/modules/installation/steps/manifest/manifest.repository.ts";
import type { InstalledManifest } from "@/modules/installation/steps/manifest/manifest.typedefs.ts";
import { PI_SKILLS_HOME_RELATIVE_PATH } from "@/modules/installation/steps/piExtension/piExtension.constants.ts";
import { PiExtensionService } from "@/modules/installation/steps/piExtension/piExtension.repository.ts";
import { SeedService } from "@/modules/installation/steps/seed/seed.repository.ts";
import { SettingsService } from "@/modules/installation/steps/settings/settings.repository.ts";
import { ShimService } from "@/modules/installation/steps/shim/shim.repository.ts";
import { SkillsService } from "@/modules/installation/steps/skills/skills.repository.ts";
import { JsonFileService } from "@/modules/installation/utils/jsonFile/jsonFile.repository.ts";
import {
  type JsonFileError,
  JsonFileErrorKind,
  type JsonObject,
  type JsonValue,
} from "@/modules/installation/utils/jsonFile/jsonFile.typedefs.ts";

/** `install`/`uninstall`/`--dry-run` orchestration: sequences CLI shim, skills,
 * hooks, and registry seed, in that order. */
export class InstallService extends Service {
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
    const home = this.gateways.env.home();
    return {
      home,
      distPath: InstallService.defaultDistPath(repoRoot),
      extensionDistPath: joinAbs(repoRoot, PI_EXTENSION_DIST_RELATIVE_PATH),
      manifestPath: ManifestService.defaultPath(home),
      settingsPath: SettingsService.defaultPath(home),
      settingsBackupPath: SettingsService.defaultBackupPath(home),
      skillsSourceDir: InstallService.defaultSkillsSourceDir(repoRoot),
      skillsTargetDir: SkillsService.defaultTargetDir(home),
      piSkillsTargetDir: expandPath(PI_SKILLS_HOME_RELATIVE_PATH, home),
      piExtensionTargetPath: PiExtensionService.defaultPath(home),
      shimPath: ShimService.defaultPath(home),
      registryPath: registryPath(home),
    };
  }

  /** Absent `--agents` means every known host. */
  private static resolveTargets(
    selected: readonly AgentTarget[] | undefined,
  ): readonly AgentTarget[] {
    return selected ?? [AgentTarget.ClaudeCode, AgentTarget.Pi];
  }

  private static targetsLabel(targets: readonly AgentTarget[]): string {
    return targets.map((target) => target.valueOf()).join(",");
  }

  async install(options: InstallOptions): Promise<Result<InstallReport, InstallError>> {
    const { fs } = this.gateways;
    const repoRoot = options.repoRoot;
    const paths = this.gatherHomePaths(repoRoot);
    const targets = InstallService.resolveTargets(options.targets);
    const hasClaude = targets.includes(AgentTarget.ClaudeCode);
    const hasPi = targets.includes(AgentTarget.Pi);

    const bunPathResult = await this.makeService(BunPathService).resolve();
    if (!bunPathResult.ok) {
      return {
        ok: false,
        error: InstallService.bunPathErrorToInstallError(bunPathResult.error),
      };
    }
    const bunPath = bunPathResult.value;

    const manifestService = this.makeService(ManifestService);
    const settingsService = this.makeService(SettingsService);

    const previousManifest = await manifestService.load(paths.manifestPath);
    const manifestCommands = new Set(
      previousManifest !== null ? Object.values(previousManifest.hookCommands) : [],
    );
    const runLegacyPurge = previousManifest === null || !previousManifest.legacyPurgeDone;

    // Claude-only state: settings.json surgery and its diff. A pi-only install
    // must not read, require, or touch `~/.claude/settings.json` at all.
    let surgery: ReturnType<typeof SettingsService.surgerize> | null = null;
    let settingsDiffLines: readonly string[] = [];
    if (hasClaude) {
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
      surgery = SettingsService.surgerize(
        settingsBefore,
        manifestCommands,
        runLegacyPurge,
        bunPath,
        paths.distPath,
      );
      settingsDiffLines = SettingsService.diffLines(
        JsonFileService.stringify(settingsBefore),
        JsonFileService.stringify(surgery.settings),
      );
    }

    const actionLines: string[] = [`agents: ${InstallService.targetsLabel(targets)}`];
    if (surgery !== null) {
      const purgeLine = SettingsService.purgeSummaryLine(surgery.summary);
      if (purgeLine !== null) actionLines.push(purgeLine);
      for (const registration of HOOK_DESCRIPTORS) {
        actionLines.push(
          SettingsService.hookRegisteredLine(registration.event, registration.name),
        );
      }
    }

    const skillsService = this.makeService(SkillsService);
    const skillNames = await skillsService.discoverNames(paths.skillsSourceDir);
    const registryExists = await fs.exists(paths.registryPath);

    if (options.dryRun) {
      for (const name of skillNames) {
        if (hasClaude) actionLines.push(`skill ${name}`);
        if (hasPi) actionLines.push(`pi skill ${name}`);
      }
      if (hasClaude) {
        actionLines.push(
          registryExists
            ? "registry exists (left as-is)"
            : `would seed registry -> ${paths.registryPath}`,
        );
        actionLines.push(`would write CLI shim -> ${paths.shimPath}`);
      }
      if (hasPi) {
        actionLines.push(`would copy pi extension -> ${paths.piExtensionTargetPath}`);
      }
      return {
        ok: true,
        value: { dryRun: true, targets, actionLines, settingsDiffLines },
      };
    }

    let skillsOutcome = previousManifest?.skills ?? [];
    let piSkillsOutcome = previousManifest?.piSkills ?? [];
    let hookCommands: Record<string, string> = previousManifest?.hookCommands ?? {};
    let settingsBackupPathForManifest = previousManifest?.settingsBackupPath ?? null;

    if (hasClaude && surgery !== null) {
      const alreadyBackedUpSettings =
        previousManifest !== null && previousManifest.settingsBackupPath !== null;
      const didBackupSettings = await settingsService.backupIfNeeded(
        paths.settingsPath,
        paths.settingsBackupPath,
        alreadyBackedUpSettings,
      );
      await settingsService.save(paths.settingsPath, surgery.settings);
      settingsBackupPathForManifest = InstallService.resolveManifestBackupPath(
        alreadyBackedUpSettings,
        didBackupSettings,
        previousManifest?.settingsBackupPath ?? null,
        paths.settingsBackupPath,
      );

      const claudeSkills = await skillsService.install(
        paths.skillsSourceDir,
        paths.skillsTargetDir,
        skillNames,
        previousManifest?.skills ?? [],
      );
      actionLines.push(...claudeSkills.actionLines);
      skillsOutcome = claudeSkills.skills;
      hookCommands = surgery.hookCommands;
    }

    // The shim backs BOTH hosts — the pi bridge execs it exactly like Claude
    // Code's hooks do — so it is written whenever anything is installed.
    await this.makeService(ShimService).write(paths.shimPath, bunPath, paths.distPath);

    if (hasPi) {
      await this.makeService(PiExtensionService).install(
        paths.extensionDistPath,
        paths.piExtensionTargetPath,
      );
      actionLines.push(`pi extension -> ${paths.piExtensionTargetPath}`);

      const piSkills = await skillsService.install(
        paths.skillsSourceDir,
        paths.piSkillsTargetDir,
        skillNames,
        previousManifest?.piSkills ?? [],
      );
      for (const name of skillNames) actionLines.push(`pi skill ${name}`);
      piSkillsOutcome = piSkills.skills;
    }

    const seedOutcome = await this.makeService(SeedService).seed(repoRoot, paths.home);
    actionLines.push(seedOutcome.actionLine);

    const nextManifest: InstalledManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      repoRoot,
      bunPath,
      distPath: paths.distPath,
      hookCommands,
      shimPath: paths.shimPath,
      skills: skillsOutcome,
      settingsBackupPath: settingsBackupPathForManifest,
      legacyPurgeDone: true,
      piExtensionPath: hasPi
        ? paths.piExtensionTargetPath
        : (previousManifest?.piExtensionPath ?? null),
      piSkills: piSkillsOutcome,
    };
    await manifestService.save(paths.manifestPath, nextManifest);

    return {
      ok: true,
      value: { dryRun: false, targets, actionLines, settingsDiffLines },
    };
  }

  /** Reverses exactly what the manifest records — registry and vault content are
   * never touched, since those are the user's data, not an installed artifact. */
  async uninstall(): Promise<UninstallReport> {
    const { fs } = this.gateways;
    const home = this.gateways.env.home();
    const manifestService = this.makeService(ManifestService);
    const settingsService = this.makeService(SettingsService);
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
    const manifestHookCommands = Object.values(manifest.hookCommands);
    if (settingsResult.ok && manifestHookCommands.length > 0) {
      const manifestCommands = new Set(manifestHookCommands);
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

    if (manifest.piExtensionPath) {
      await this.makeService(PiExtensionService).remove(
        absPath(manifest.piExtensionPath),
      );
      actionLines.push(`removed pi extension -> ${manifest.piExtensionPath}`);
    }
    const piSkillsTargetDir = expandPath(PI_SKILLS_HOME_RELATIVE_PATH, home);
    await Promise.all(
      (manifest.piSkills ?? []).map((skill) =>
        this.restoreOneSkill(piSkillsTargetDir, skill),
      ),
    );
    for (const skill of manifest.piSkills ?? []) {
      actionLines.push(`removed pi skill ${skill.name}`);
    }

    await fs.remove(manifestPath);
    actionLines.push("removed installed.json manifest");

    return { uninstalled: true, actionLines };
  }

  private async restoreOneSkill(
    skillsTargetDir: AbsPath,
    skill: { readonly name: string; readonly backedUp: boolean },
  ): Promise<void> {
    const targetPath = joinAbs(skillsTargetDir, skill.name);
    await this.gateways.fs.remove(targetPath);
    if (!skill.backedUp) return;
    const backupPath = absPath(`${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}`);
    if (await this.gateways.fs.exists(backupPath)) {
      await this.gateways.fs.rename(backupPath, targetPath);
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
