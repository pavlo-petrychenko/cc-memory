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
  resolveBunPath,
} from "@/install/steps/bunPath/index.ts";
import {
  defaultManifestPath,
  type InstalledManifest,
  loadManifest,
  MANIFEST_SCHEMA_VERSION,
  PRE_CCMEMORY_BACKUP_SUFFIX,
  saveManifest,
} from "@/install/steps/manifest/index.ts";
import { seedRegistry } from "@/install/steps/seed/index.ts";
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
} from "@/install/steps/settings/index.ts";
import { defaultShimPath, writeShim } from "@/install/steps/shim/index.ts";
import {
  defaultSkillsTargetDir,
  discoverSkillNames,
  installSkills,
} from "@/install/steps/skills/index.ts";
import {
  isJsonArray,
  isJsonObject,
  type JsonFileError,
  JsonFileErrorKind,
  type JsonObject,
  type JsonValue,
  stringifyJson,
} from "@/install/utils/jsonFile/index.ts";
import type { Container } from "@/platform/index.ts";
import { defaultRegistryPath } from "@/workspace/index.ts";

/**
 * `install`/`uninstall`/`--dry-run` orchestration. Every step above this
 * file is deliberately small and independently testable; this file is the
 * one place that sequences them: CLI shim, skills, hooks, registry seed —
 * in that order.
 */

export function defaultDistPath(repoRoot: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal relative path onto an already-absolute,
  // normalized `repoRoot`.
  return `${repoRoot}/${DIST_RELATIVE_PATH}` as AbsPath;
}

export function defaultSkillsSourceDir(repoRoot: AbsPath): AbsPath {
  // SAFETY: same reasoning as `defaultDistPath` above.
  return `${repoRoot}/${SKILLS_SOURCE_RELATIVE_PATH}` as AbsPath;
}

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

/**
 * Everything `install`/`uninstall` need to identify their own artifacts
 * later, kept together so this file's two entry points don't repeat the same
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
 * then either report it (`dryRun`) or apply every write in order: CLI shim,
 * skills, hooks, registry seed. */
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
    settingsBackupPath: settingsBackupPathForManifest,
    legacyPurgeDone: true,
  };
  await saveManifest(fs, paths.manifestPath, nextManifest);

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
export async function runUninstall(container: Container): Promise<UninstallReport> {
  const { fs } = container;
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
