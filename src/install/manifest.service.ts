import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { FileSystem } from "../platform/fileSystem.typedefs.ts";
import type { JsonObject, JsonValue } from "./json.service.ts";
import {
  isJsonArray,
  isJsonBoolean,
  isJsonNumber,
  isJsonObject,
  isJsonString,
  readJsonObjectFile,
  writeJsonObjectAtomic,
} from "./json.service.ts";

/**
 * `~/.claude/memory/installed.json` — a record of exactly what THIS
 * installer wrote last time, rather than an installer having to guess by
 * matching a substring in an existing command string. Read before every
 * install/uninstall so:
 *   - hook groups get purged by their EXACT former command string, not a
 *     substring — a moved/renamed repo still gets cleaned up (no orphans);
 *   - `uninstall` reverses exactly these artifacts, nothing guessed;
 *   - the one-time legacy substring purge (for entries left by an install
 *     that predates this manifest) runs exactly once.
 */

// A literal `~/`-prefix — `expandPath` only expands a LEADING `~`, matching
// `registry.service.ts`'s `REGISTRY_HOME_RELATIVE_PATH` pattern.
const MANIFEST_HOME_RELATIVE_PATH = "~/.claude/memory/installed.json";

/** Bumped only if this manifest's own shape changes — unrelated to the
 * index's schema version or the registry's schema. */
export const MANIFEST_SCHEMA_VERSION = 1;

/** The `.pre-ccmemory.bak` suffix, shared by `skills.ts` (a pre-existing real
 * skill directory) and `settings.ts` (the one-time pristine `settings.json`
 * backup this installer makes before its first write). */
export const PRE_CCMEMORY_BACKUP_SUFFIX = ".pre-ccmemory.bak";

export type SkillManifestEntry = {
  readonly name: string;
  /** True when installing this skill moved a pre-existing REAL directory to
   * `<name>.pre-ccmemory.bak` — `uninstall` only restores a backup that
   * exists. */
  readonly backedUp: boolean;
};

export type InstalledManifest = {
  readonly schemaVersion: number;
  readonly repoRoot: string;
  readonly bunPath: string;
  readonly distPath: string;
  /** `HookEvent` -> the exact command string last registered for it
   * (`<bunPath> <distPath> hook <name>`) — the purge-by-manifest key. */
  readonly hookCommands: Readonly<Record<string, string>>;
  readonly shimPath: string;
  readonly skills: readonly SkillManifestEntry[];
  /** The ONE pristine `settings.json` backup this installer ever makes,
   * before its first write. */
  readonly settingsBackupPath: string | null;
  /** True once the one-time legacy substring purge has run — see the doc
   * comment above. */
  readonly legacyPurgeDone: boolean;
};

export function defaultManifestPath(home: AbsPath): AbsPath {
  return expandPath(MANIFEST_HOME_RELATIVE_PATH, home);
}

function isStringRecord(value: JsonValue): value is Readonly<Record<string, string>> {
  if (!isJsonObject(value)) return false;
  return Object.values(value).every((entry) => isJsonString(entry));
}

function parseSkillEntry(value: JsonValue): SkillManifestEntry | null {
  if (!isJsonObject(value)) return null;
  const name = value["name"];
  const backedUp = value["backedUp"];
  if (name === undefined || backedUp === undefined) return null;
  if (!isJsonString(name) || !isJsonBoolean(backedUp)) return null;
  return { name, backedUp };
}

function parseNullableString(value: JsonValue | undefined): string | null {
  return value !== undefined && isJsonString(value) ? value : null;
}

/**
 * Validate a parsed `installed.json` into a typed `InstalledManifest`, or
 * `null` for anything that doesn't match — a missing, corrupt, or
 * pre-manifest-era file are all treated identically to "no manifest yet"
 * (the same degrade-gracefully stance `registry.service.ts`'s `loadRegistry`
 * takes for an absent `registry.toml`, since a broken manifest just means
 * this run falls back to the one-time legacy substring purge).
 */
function parseManifest(value: JsonObject): InstalledManifest | null {
  const schemaVersion = value["schemaVersion"];
  const repoRoot = value["repoRoot"];
  const bunPath = value["bunPath"];
  const distPath = value["distPath"];
  const hookCommands = value["hookCommands"];
  const shimPath = value["shimPath"];
  const skills = value["skills"];
  const settingsBackupPath = value["settingsBackupPath"];
  const legacyPurgeDone = value["legacyPurgeDone"];

  if (
    schemaVersion === undefined ||
    repoRoot === undefined ||
    bunPath === undefined ||
    distPath === undefined ||
    hookCommands === undefined ||
    shimPath === undefined ||
    skills === undefined ||
    legacyPurgeDone === undefined ||
    !isJsonNumber(schemaVersion) ||
    !isJsonString(repoRoot) ||
    !isJsonString(bunPath) ||
    !isJsonString(distPath) ||
    !isStringRecord(hookCommands) ||
    !isJsonString(shimPath) ||
    !isJsonArray(skills) ||
    !isJsonBoolean(legacyPurgeDone)
  ) {
    return null;
  }
  const parsedSkills = skills.map(parseSkillEntry);
  if (parsedSkills.some((entry) => entry === null)) return null;

  return {
    schemaVersion,
    repoRoot,
    bunPath,
    distPath,
    hookCommands,
    shimPath,
    // SAFETY: every element passed the `entry === null` check above.
    skills: parsedSkills as readonly SkillManifestEntry[],
    settingsBackupPath: parseNullableString(settingsBackupPath),
    legacyPurgeDone,
  };
}

/** `null` for "no manifest yet" — either the file doesn't exist, or it exists
 * but doesn't parse as our schema (a hand-edit, a future schema bump, or
 * simple corruption). Both cases fall back to first-run behavior rather than
 * failing the install. */
export async function loadManifest(
  fs: FileSystem,
  path: AbsPath,
): Promise<InstalledManifest | null> {
  const result = await readJsonObjectFile(fs, path);
  if (!result.ok) return null;
  if (Object.keys(result.value).length === 0) return null; // missing file -> `{}`
  return parseManifest(result.value);
}

function skillEntryToJson(entry: SkillManifestEntry): JsonObject {
  return { name: entry.name, backedUp: entry.backedUp };
}

export function serializeManifest(manifest: InstalledManifest): JsonObject {
  return {
    schemaVersion: manifest.schemaVersion,
    repoRoot: manifest.repoRoot,
    bunPath: manifest.bunPath,
    distPath: manifest.distPath,
    hookCommands: manifest.hookCommands,
    shimPath: manifest.shimPath,
    skills: manifest.skills.map(skillEntryToJson),
    settingsBackupPath: manifest.settingsBackupPath,
    legacyPurgeDone: manifest.legacyPurgeDone,
  };
}

export async function saveManifest(
  fs: FileSystem,
  path: AbsPath,
  manifest: InstalledManifest,
): Promise<void> {
  await writeJsonObjectAtomic(fs, path, serializeManifest(manifest));
}
