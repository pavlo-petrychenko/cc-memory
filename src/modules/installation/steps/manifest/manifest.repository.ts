import { Service } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { manifestPath } from "@/core/index.ts";
import type {
  InstalledManifest,
  SkillManifestEntry,
} from "@/modules/installation/steps/manifest/manifest.typedefs.ts";
import { JsonFileService } from "@/modules/installation/utils/jsonFile/jsonFile.repository.ts";
import type {
  JsonObject,
  JsonValue,
} from "@/modules/installation/utils/jsonFile/jsonFile.typedefs.ts";

/** `~/.claude/memory/installed.json` — a record of exactly what THIS installer
 * wrote last time, so hook groups get purged by exact command string, `uninstall`
 * reverses exactly these artifacts, and the one-time legacy purge runs exactly once. */
export class ManifestService extends Service {
  static defaultPath(home: AbsPath): AbsPath {
    return manifestPath(home);
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

  /** Absent means the field was never written (pre-pi manifest) → empty. A
   * present-but-malformed array rejects the whole manifest, like `skills`. */
  private static parseSkillEntries(
    value: JsonValue | undefined,
  ): readonly SkillManifestEntry[] | null {
    if (value === undefined) return [];
    if (!JsonFileService.isArray(value)) return null;
    const parsed = value.map((entry) => ManifestService.parseSkillEntry(entry));
    if (parsed.some((entry) => entry === null)) return null;
    // SAFETY: every element passed the `entry === null` check above.
    return parsed as readonly SkillManifestEntry[];
  }

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
    const parsedSkills = ManifestService.parseSkillEntries(skills);
    const parsedPiSkills = ManifestService.parseSkillEntries(value["piSkills"]);
    const parsedClaudeCommands = ManifestService.parseSkillEntries(
      value["claudeCommands"],
    );
    if (parsedSkills === null || parsedPiSkills === null || parsedClaudeCommands === null)
      return null;

    return {
      schemaVersion,
      repoRoot,
      bunPath,
      distPath,
      hookCommands,
      shimPath,
      skills: parsedSkills,
      settingsBackupPath: ManifestService.parseNullableString(settingsBackupPath),
      legacyPurgeDone,
      piExtensionPath: ManifestService.parseNullableString(value["piExtensionPath"]),
      piSkills: parsedPiSkills,
      claudeCommands: parsedClaudeCommands,
    };
  }

  async load(path: AbsPath): Promise<InstalledManifest | null> {
    const result = await this.makeService(JsonFileService).readObjectFile(path);
    if (!result.ok) return null;
    if (Object.keys(result.value).length === 0) return null;
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
      piExtensionPath: manifest.piExtensionPath ?? null,
      piSkills: (manifest.piSkills ?? []).map(ManifestService.skillEntryToJson),
      claudeCommands: (manifest.claudeCommands ?? []).map(
        ManifestService.skillEntryToJson,
      ),
    };
  }

  async save(path: AbsPath, manifest: InstalledManifest): Promise<void> {
    await this.makeService(JsonFileService).writeObjectAtomic(
      path,
      ManifestService.serialize(manifest),
    );
  }
}
