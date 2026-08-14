import type { AbsPath } from "../core/AbsPath.ts";
import type { Result } from "../core/Result.ts";
import type { Container } from "../platform/container.ts";
import { defaultRegistryPath } from "../workspace/registry.service.ts";
import {
  type BunPathError,
  BunPathErrorKind,
  resolveBunPath,
} from "./bunPath.service.ts";
import {
  isJsonArray,
  isJsonObject,
  type JsonFileError,
  JsonFileErrorKind,
  type JsonObject,
  type JsonValue,
  stringifyJson,
} from "./json.service.ts";
import {
  defaultPlistPath,
  defaultPlistTemplatePath,
  defaultReflectorLogPath,
  installLaunchd,
  launchdPathEnv,
  uninstallLaunchd,
} from "./launchd.service.ts";
import {
  defaultManifestPath,
  type InstalledManifest,
  loadManifest,
  MANIFEST_SCHEMA_VERSION,
  PRE_CCMEMORY_BACKUP_SUFFIX,
  saveManifest,
} from "./manifest.service.ts";
import { seedRegistry } from "./seed.service.ts";
import {
  backupSettingsIfNeeded,
  commandsInGroup,
  defaultSettingsBackupPath,
  defaultSettingsPath,
  diffLines,
  HOOK_REGISTRATION_ORDER,
  hookRegisteredLine,
  loadSettings,
  purgeSummaryLine,
  saveSettings,
  surgerizeSettings,
} from "./settings.service.ts";
import { defaultShimPath, writeShim } from "./shim.service.ts";
import {
  defaultSkillsTargetDir,
  discoverSkillNames,
  installSkills,
} from "./skills.service.ts";

/**
 * `install`/`uninstall`/`--dry-run` orchestration (`tools/install.py:183-191`,
 * plus the two additive modes Python never had). Everything above this file
 * is deliberately small and independently testable; `run.ts` is the one place
 * that sequences them the way `tools/install.py:main()` does: CLI, skills,
 * hooks, registry seed, launchd — in that order.
 */

const DIST_RELATIVE_PATH = "dist/memory.js";
const SKILLS_SOURCE_RELATIVE_PATH = "src/skills";

export function defaultDistPath(repoRoot: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal relative path onto an already-absolute,
  // normalized `repoRoot`.
  return `${repoRoot}/${DIST_RELATIVE_PATH}` as AbsPath;
}

export function defaultSkillsSourceDir(repoRoot: AbsPath): AbsPath {
  // SAFETY: same reasoning as `defaultDistPath` above.
  return `${repoRoot}/${SKILLS_SOURCE_RELATIVE_PATH}` as AbsPath;
}

export type InstallOptions = {
  readonly repoRoot: AbsPath;
  readonly dryRun: boolean;
};

export enum InstallErrorKind {
  BunNotFound = "bun_not_found",
  BunUnresolvable = "bun_unresolvable",
  SettingsUnreadable = "settings_unreadable",
}

export type InstallError =
  | { readonly kind: InstallErrorKind.BunNotFound }
  | { readonly kind: InstallErrorKind.BunUnresolvable; readonly attemptedPath: string }
  | { readonly kind: InstallErrorKind.SettingsUnreadable; readonly message: string };

function bunPathErrorToInstallError(error: BunPathError): InstallError {
  return error.kind === BunPathErrorKind.NotFound
    ? { kind: InstallErrorKind.BunNotFound }
    : { kind: InstallErrorKind.BunUnresolvable, attemptedPath: error.attemptedPath };
}

/** The `settingsBackupPath` to record in the manifest after this run — kept
 * as its own `if`/`else` (not a nested ternary, which lint forbids) since it
 * has to cover three distinct cases: already backed up before (keep that
 * path), backed up just now (the fresh path), or never backed up because
 * `settings.json` didn't exist yet (`null`). */
function resolveManifestBackupPath(
  alreadyBackedUp: boolean,
  didBackupJustNow: boolean,
  previousBackupPath: string | null,
  freshBackupPath: AbsPath,
): string | null {
  if (alreadyBackedUp) return previousBackupPath;
  if (didBackupJustNow) return freshBackupPath;
  return null;
}

function settingsFileErrorMessage(error: JsonFileError): string {
  return error.kind === JsonFileErrorKind.ParseError
    ? `settings.json does not parse as JSON: ${error.message}`
    : "settings.json's top level is not an object";
}

export type InstallReport = {
  readonly dryRun: boolean;
  /** Human-readable lines describing what was (or, under `--dry-run`, would
   * be) done — `tools/install.py`'s interleaved `log(...)` calls, collected
   * instead of printed inline so `install.command.ts` renders them. */
  readonly actionLines: readonly string[];
  /** Only non-empty when `settings.json` actually changes. */
  readonly settingsDiffLines: readonly string[];
};

/**
 * Everything `install`/`uninstall` need to identify their own artifacts
 * later, kept together so `run.ts`'s two entry points don't repeat the same
 * five `default*Path` calls with subtly different arguments.
 */
async function gatherHomePaths(container: Container, repoRoot: AbsPath) {
  const home = container.env.home();
  return {
    home,
    distPath: defaultDistPath(repoRoot),
    manifestPath: defaultManifestPath(home),
    settingsPath: defaultSettingsPath(home),
    settingsBackupPath: defaultSettingsBackupPath(home),
    skillsSourceDir: defaultSkillsSourceDir(repoRoot),
    skillsTargetDir: defaultSkillsTargetDir(home),
    shimPath: defaultShimPath(home),
    registryPath: defaultRegistryPath(home),
  };
}

/** `install [--dry-run]` — resolve `bun`, compute the `settings.json` surgery,
 * then either report it (`dryRun`) or apply every write in Python's original
 * order (CLI shim, skills, hooks, registry seed, launchd). */
export async function runInstall(
  container: Container,
  options: InstallOptions,
): Promise<Result<InstallReport, InstallError>> {
  const { fs, proc } = container;
  const repoRoot = options.repoRoot;
  const paths = await gatherHomePaths(container, repoRoot);

  const bunPathResult = await resolveBunPath(proc, fs);
  if (!bunPathResult.ok)
    return { ok: false, error: bunPathErrorToInstallError(bunPathResult.error) };
  const bunPath = bunPathResult.value;

  const previousManifest = await loadManifest(fs, paths.manifestPath);
  const manifestCommands = new Set(
    previousManifest !== null ? Object.values(previousManifest.hookCommands) : [],
  );
  const runLegacyPurge = previousManifest === null || !previousManifest.legacyPurgeDone;

  const settingsResult = await loadSettings(fs, paths.settingsPath);
  if (!settingsResult.ok) {
    return {
      ok: false,
      error: {
        kind: InstallErrorKind.SettingsUnreadable,
        message: settingsFileErrorMessage(settingsResult.error),
      },
    };
  }
  const settingsBefore = settingsResult.value;
  const surgery = surgerizeSettings(
    settingsBefore,
    manifestCommands,
    runLegacyPurge,
    bunPath,
    paths.distPath,
  );
  const settingsDiffLines = diffLines(
    stringifyJson(settingsBefore),
    stringifyJson(surgery.settings),
  );

  const actionLines: string[] = [];
  const purgeLine = purgeSummaryLine(surgery.summary);
  if (purgeLine !== null) actionLines.push(purgeLine);
  for (const registration of HOOK_REGISTRATION_ORDER) {
    actionLines.push(hookRegisteredLine(registration.event, registration.name));
  }

  const skillNames = await discoverSkillNames(fs, paths.skillsSourceDir);
  const previousSkills = previousManifest?.skills ?? [];
  const registryExists = await fs.exists(paths.registryPath);
  const plistTemplatePath = defaultPlistTemplatePath(repoRoot);
  const plistTemplateExists = await fs.exists(plistTemplatePath);

  if (options.dryRun) {
    for (const name of skillNames) actionLines.push(`skill ${name}`);
    actionLines.push(
      registryExists
        ? "registry exists (left as-is)"
        : `would seed registry -> ${paths.registryPath}`,
    );
    actionLines.push(`would write CLI shim -> ${paths.shimPath}`);
    if (plistTemplateExists) {
      actionLines.push(`would install launchd agent -> ${defaultPlistPath(paths.home)}`);
    }
    return { ok: true, value: { dryRun: true, actionLines, settingsDiffLines } };
  }

  const alreadyBackedUpSettings =
    previousManifest !== null && previousManifest.settingsBackupPath !== null;
  const didBackupSettings = await backupSettingsIfNeeded(
    fs,
    paths.settingsPath,
    paths.settingsBackupPath,
    alreadyBackedUpSettings,
  );
  await saveSettings(fs, paths.settingsPath, surgery.settings);

  const skillsOutcome = await installSkills(
    fs,
    paths.skillsSourceDir,
    paths.skillsTargetDir,
    skillNames,
    previousSkills,
  );
  actionLines.push(...skillsOutcome.actionLines);

  await writeShim(fs, paths.shimPath, bunPath, paths.distPath);

  const seedOutcome = await seedRegistry(fs, repoRoot, paths.home);
  actionLines.push(seedOutcome.actionLine);

  const launchdOutcome = await installLaunchd(fs, proc, repoRoot, paths.home, {
    bunPath,
    distPath: paths.distPath,
    pathEnv: launchdPathEnv(paths.home),
    logPath: defaultReflectorLogPath(paths.home),
  });
  if (launchdOutcome !== null) actionLines.push(launchdOutcome.actionLine);

  const settingsBackupPathForManifest = resolveManifestBackupPath(
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
    launchdPlistPath:
      launchdOutcome !== null
        ? defaultPlistPath(paths.home)
        : (previousManifest?.launchdPlistPath ?? null),
    settingsBackupPath: settingsBackupPathForManifest,
    legacyPurgeDone: true,
  };
  await saveManifest(fs, paths.manifestPath, nextManifest);

  return { ok: true, value: { dryRun: false, actionLines, settingsDiffLines } };
}

export type UninstallReport = {
  readonly uninstalled: boolean;
  readonly actionLines: readonly string[];
};

/**
 * `uninstall` — new, additive (Python has no equivalent). Reverses exactly
 * what the manifest records: purge our hook groups from `settings.json` (by
 * exact former command, never the legacy substring — uninstall never touches
 * anything it didn't itself register), remove the shim, remove/restore each
 * skill, tear down the launchd job, then delete the manifest itself. Registry
 * and vault content are never touched — those are the user's data, not an
 * installed artifact.
 */
export async function runUninstall(container: Container): Promise<UninstallReport> {
  const { fs, proc } = container;
  const home = container.env.home();
  const manifestPath = defaultManifestPath(home);
  const manifest = await loadManifest(fs, manifestPath);
  if (manifest === null) {
    return {
      uninstalled: false,
      actionLines: ["no installed.json manifest found; nothing to do"],
    };
  }

  const actionLines: string[] = [];

  const settingsPath = defaultSettingsPath(home);
  const settingsResult = await loadSettings(fs, settingsPath);
  if (settingsResult.ok) {
    const manifestCommands = new Set(Object.values(manifest.hookCommands));
    const existingHooksField = settingsResult.value["hooks"];
    const existingHooks =
      existingHooksField !== undefined && isJsonObject(existingHooksField)
        ? existingHooksField
        : {};
    const purged = purgeHooksForUninstall(existingHooks, manifestCommands);
    await saveSettings(fs, settingsPath, { ...settingsResult.value, hooks: purged });
    actionLines.push("removed hook registrations from settings.json");
  }

  // SAFETY: `manifest.shimPath` is only ever written by `defaultShimPath` (an
  // `AbsPath`), round-tripped through JSON as a plain string.
  await fs.remove(manifest.shimPath as AbsPath);
  actionLines.push(`removed CLI shim -> ${manifest.shimPath}`);

  const skillsTargetDir = defaultSkillsTargetDir(home);
  await Promise.all(
    manifest.skills.map((skill) => restoreOneSkill(fs, skillsTargetDir, skill)),
  );
  for (const skill of manifest.skills) actionLines.push(`removed skill ${skill.name}`);

  if (manifest.launchdPlistPath !== null) {
    // SAFETY: `manifest.launchdPlistPath` is only ever written by
    // `defaultPlistPath` (an `AbsPath`), round-tripped through JSON as a
    // plain string.
    await uninstallLaunchd(fs, proc, manifest.launchdPlistPath as AbsPath);
    actionLines.push(`removed launchd agent -> ${manifest.launchdPlistPath}`);
  }

  await fs.remove(manifestPath);
  actionLines.push("removed installed.json manifest");

  return { uninstalled: true, actionLines };
}

async function restoreOneSkill(
  fs: Container["fs"],
  skillsTargetDir: AbsPath,
  skill: { readonly name: string; readonly backedUp: boolean },
): Promise<void> {
  // SAFETY: `skill.name` is one of the directory names `discoverSkillNames`
  // (`FileSystem.readDir`) returned when this skill was installed.
  const targetPath = `${skillsTargetDir}/${skill.name}` as AbsPath;
  await fs.remove(targetPath);
  if (!skill.backedUp) return;
  // SAFETY: same literal-suffix reasoning as `skills.ts`'s `backupPathFor`.
  const backupPath = `${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath;
  if (await fs.exists(backupPath)) {
    await fs.rename(backupPath, targetPath);
  }
}

/** Uninstall's own hook purge: manifest-only, no legacy substring fallback
 * (uninstall must never remove a foreign hook it never registered). Reuses
 * `settings.ts`'s `commandsInGroup` — the one piece of shape-reading logic —
 * rather than re-deciding "what's inside a hook group" a second time. */
function purgeHooksForUninstall(
  hooksByEvent: JsonObject,
  manifestCommands: ReadonlySet<string>,
): JsonObject {
  const kept: [string, JsonValue][] = [];
  for (const [event, groupsValue] of Object.entries(hooksByEvent)) {
    if (!isJsonArray(groupsValue)) {
      kept.push([event, groupsValue]);
      continue;
    }
    const remaining = groupsValue.filter(
      (group) => !commandsInGroup(group).some((command) => manifestCommands.has(command)),
    );
    if (remaining.length > 0) kept.push([event, remaining]);
  }
  return Object.fromEntries(kept);
}
