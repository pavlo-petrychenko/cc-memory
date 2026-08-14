import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import { MANIFEST_HOME_RELATIVE_PATH } from "@/install/steps/manifest/manifest.constants.ts";
import type {
  InstalledManifest,
  SkillManifestEntry,
} from "@/install/steps/manifest/manifest.typedefs.ts";
import {
  type JsonObject,
  JsonFileService,
  type JsonValue,
} from "@/install/utils/jsonFile/index.ts";
import type { FileSystem } from "@/platform/index.ts";

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
export class ManifestService {
  constructor(private readonly fs: FileSystem) {}

  static defaultPath(home: AbsPath): AbsPath {
    return expandPath(MANIFEST_HOME_RELATIVE_PATH, home);
  }

  private static isStringRecord(
    value: JsonValue,
  ): value is Readonly<Record<string, string>> {
    if (!JsonFileService.isObject(value)) return false;
    return Object.values(value).every((entry) => JsonFileService.isString(entry));
  }

  private static parseSkillEntry(value: JsonValue): SkillManifestEntry | null {
    if (!JsonFileService.isObject(value)) return null;
    const name = value["name"];
    const backedUp = value["backedUp"];
    if (name === undefined || backedUp === undefined) return null;
    if (!JsonFileService.isString(name) || !JsonFileService.isBoolean(backedUp)) {
      return null;
    }
    return { name, backedUp };
  }

  private static parseNullableString(value: JsonValue | undefined): string | null {
    return value !== undefined && JsonFileService.isString(value) ? value : null;
  }

  /**
   * Validate a parsed `installed.json` into a typed `InstalledManifest`, or
   * `null` for anything that doesn't match — a missing, corrupt, or
   * pre-manifest-era file are all treated identically to "no manifest yet"
   * (the same degrade-gracefully stance `registry.service.ts`'s
   * `loadRegistry` takes for an absent `registry.toml`, since a broken
   * manifest just means this run falls back to the one-time legacy
   * substring purge).
   */
  private static parseManifest(value: JsonObject): InstalledManifest | null {
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
      !JsonFileService.isNumber(schemaVersion) ||
      !JsonFileService.isString(repoRoot) ||
      !JsonFileService.isString(bunPath) ||
      !JsonFileService.isString(distPath) ||
      !ManifestService.isStringRecord(hookCommands) ||
      !JsonFileService.isString(shimPath) ||
      !JsonFileService.isArray(skills) ||
      !JsonFileService.isBoolean(legacyPurgeDone)
    ) {
      return null;
    }
    const parsedSkills = skills.map(ManifestService.parseSkillEntry);
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
      settingsBackupPath: ManifestService.parseNullableString(settingsBackupPath),
      legacyPurgeDone,
    };
  }

  /** `null` for "no manifest yet" — either the file doesn't exist, or it
   * exists but doesn't parse as our schema (a hand-edit, a future schema
   * bump, or simple corruption). Both cases fall back to first-run behavior
   * rather than failing the install. */
  async load(path: AbsPath): Promise<InstalledManifest | null> {
    const result = await new JsonFileService(this.fs).readObjectFile(path);
    if (!result.ok) return null;
    if (Object.keys(result.value).length === 0) return null; // missing file -> `{}`
    return ManifestService.parseManifest(result.value);
  }

  private static skillEntryToJson(entry: SkillManifestEntry): JsonObject {
    return { name: entry.name, backedUp: entry.backedUp };
  }

  static serialize(manifest: InstalledManifest): JsonObject {
    return {
      schemaVersion: manifest.schemaVersion,
      repoRoot: manifest.repoRoot,
      bunPath: manifest.bunPath,
      distPath: manifest.distPath,
      hookCommands: manifest.hookCommands,
      shimPath: manifest.shimPath,
      skills: manifest.skills.map(ManifestService.skillEntryToJson),
      settingsBackupPath: manifest.settingsBackupPath,
      legacyPurgeDone: manifest.legacyPurgeDone,
    };
  }

  async save(path: AbsPath, manifest: InstalledManifest): Promise<void> {
    await new JsonFileService(this.fs).writeObjectAtomic(
      path,
      ManifestService.serialize(manifest),
    );
  }
}
