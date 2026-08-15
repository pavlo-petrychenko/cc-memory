import type { AbsPath } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import { PRE_CCMEMORY_BACKUP_SUFFIX } from "@/modules/installation/steps/manifest/manifest.constants.ts";
import { LEGACY_HOOK_SUBSTRINGS } from "@/modules/installation/steps/settings/settings.constants.ts";
import { SETTINGS_HOME_RELATIVE_PATH } from "@/modules/installation/steps/settings/settings.constants.ts";
import type {
  HookPurgeSummary,
  HookSurgeryResult,
  PurgeHooksResult,
  RegisterHooksResult,
} from "@/modules/installation/steps/settings/settings.typedefs.ts";
import { JsonFileService } from "@/modules/installation/utils/jsonFile/jsonFile.service.ts";
import type {
  JsonFileError,
  JsonObject,
  JsonValue,
} from "@/modules/installation/utils/jsonFile/jsonFile.typedefs.ts";
import { HOOK_DESCRIPTORS } from "@/modules/session/session.constants.ts";

/** `~/.claude/settings.json` surgery: purge our own hook groups, re-register the 5
 * hooks at their current location, and preserve every foreign entry byte-for-byte. */
export class SettingsService {
  constructor(private readonly fs: FileSystem) {}

  static defaultPath(home: AbsPath): AbsPath {
    return expandPath(SETTINGS_HOME_RELATIVE_PATH, home);
  }

  static defaultBackupPath(home: AbsPath): AbsPath {
    return absPath(`${SettingsService.defaultPath(home)}${PRE_CCMEMORY_BACKUP_SUFFIX}`);
  }

  static hookCommand(bunPath: string, distPath: string, hookName: string): string {
    return `${bunPath} ${distPath} hook ${hookName}`;
  }

  /** Tolerant of anything that doesn't match the expected shape — a foreign tool's
   * group is preserved either way; this only decides whether a group is OURS. */
  static commandsInGroup(group: JsonValue): readonly string[] {
    if (!JsonFileService.isObject(group)) return [];
    const hooksField = group["hooks"];
    if (hooksField === undefined || !JsonFileService.isArray(hooksField)) return [];
    const commands: string[] = [];
    for (const hookEntry of hooksField) {
      if (!JsonFileService.isObject(hookEntry)) continue;
      const command = hookEntry["command"];
      if (command !== undefined && JsonFileService.isString(command)) {
        commands.push(command);
      }
    }
    return commands;
  }

  /** Purges by exact former command string first (survives a moved/renamed repo),
   * then — only when `runLegacyPurge` — by legacy substring, so a pre-manifest
   * settings.json still gets cleaned up exactly once. */
  private static purgeOurHooks(
    hooksByEvent: JsonObject,
    manifestCommands: ReadonlySet<string>,
    runLegacyPurge: boolean,
  ): PurgeHooksResult {
    let purgedByManifestCount = 0;
    let purgedByLegacyCount = 0;
    const keptEntries: [string, JsonValue][] = [];

    for (const [event, groupsValue] of Object.entries(hooksByEvent)) {
      if (!JsonFileService.isArray(groupsValue)) {
        keptEntries.push([event, groupsValue]);
        continue;
      }
      const afterManifestPurge = groupsValue.filter((group) => {
        const isOurs = SettingsService.commandsInGroup(group).some((command) =>
          manifestCommands.has(command),
        );
        if (isOurs) purgedByManifestCount += 1;
        return !isOurs;
      });
      const afterLegacyPurge = runLegacyPurge
        ? afterManifestPurge.filter((group) => {
            const isLegacy = SettingsService.commandsInGroup(group).some((command) =>
              LEGACY_HOOK_SUBSTRINGS.some((needle) => command.includes(needle)),
            );
            if (isLegacy) purgedByLegacyCount += 1;
            return !isLegacy;
          })
        : afterManifestPurge;

      if (afterLegacyPurge.length > 0) keptEntries.push([event, afterLegacyPurge]);
    }

    return {
      hooks: Object.fromEntries(keptEntries),
      summary: { purgedByManifestCount, purgedByLegacyCount },
    };
  }

  /** Appends a fresh group to whichever array survived the purge for that event,
   * preserving both the event's position and any foreign groups already in it. */
  private static registerOurHooks(
    hooksByEvent: JsonObject,
    bunPath: string,
    distPath: string,
  ): RegisterHooksResult {
    // A plain `Map`, never re-spread inside the loop (quadratic) — converted back
    // to a `JsonObject` once, after the loop.
    const hooks = new Map<string, JsonValue>(Object.entries(hooksByEvent));
    const hookCommands: Record<string, string> = {};

    for (const registration of HOOK_DESCRIPTORS) {
      const command = SettingsService.hookCommand(bunPath, distPath, registration.name);
      hookCommands[registration.event] = command;
      const existing = hooks.get(registration.event);
      const existingGroups =
        existing !== undefined && JsonFileService.isArray(existing) ? existing : [];
      const newGroup: JsonObject = {
        hooks: [{ type: "command", command, timeout: registration.timeoutSeconds }],
      };
      hooks.set(registration.event, [...existingGroups, newGroup]);
    }

    return { hooks: Object.fromEntries(hooks), hookCommands };
  }

  static surgerize(
    settings: JsonObject,
    manifestCommands: ReadonlySet<string>,
    runLegacyPurge: boolean,
    bunPath: string,
    distPath: string,
  ): HookSurgeryResult {
    const existingHooksField = settings["hooks"];
    const existingHooks =
      existingHooksField !== undefined && JsonFileService.isObject(existingHooksField)
        ? existingHooksField
        : {};
    const { hooks: purgedHooks, summary } = SettingsService.purgeOurHooks(
      existingHooks,
      manifestCommands,
      runLegacyPurge,
    );
    const { hooks: finalHooks, hookCommands } = SettingsService.registerOurHooks(
      purgedHooks,
      bunPath,
      distPath,
    );
    return { settings: { ...settings, hooks: finalHooks }, hookCommands, summary };
  }

  static purgeSummaryLine(summary: HookPurgeSummary): string | null {
    const removed = summary.purgedByManifestCount + summary.purgedByLegacyCount;
    if (removed === 0) return null;
    const suffix = removed === 1 ? "y" : "ies";
    return `purged ${removed} stale cc-memory/legacy hook entr${suffix}`;
  }

  static hookRegisteredLine(event: string, hookName: string): string {
    return `hook ${event} -> ${hookName}`;
  }

  async load(path: AbsPath): Promise<Result<JsonObject, JsonFileError>> {
    return new JsonFileService(this.fs).readObjectFile(path);
  }

  /** Backs up the raw `settings.json` bytes ONCE, before this installer's first
   * write. `alreadyBackedUp` comes from the manifest, so a user deleting the
   * backup by hand can't trigger a second, already-mutated "pristine" copy. */
  async backupIfNeeded(
    settingsPath: AbsPath,
    backupPath: AbsPath,
    alreadyBackedUp: boolean,
  ): Promise<boolean> {
    if (alreadyBackedUp) return false;
    if (!(await this.fs.exists(settingsPath))) return false;
    const rawContent = await this.fs.readFile(settingsPath);
    await this.fs.writeFile(backupPath, rawContent);
    return true;
  }

  async save(path: AbsPath, settings: JsonObject): Promise<void> {
    await new JsonFileService(this.fs).writeObjectAtomic(path, settings);
  }

  /** A minimal line-by-line diff via a plain O(n·m) LCS table, for `--dry-run` only
   * — `settings.json` is a handful of lines even with every hook group. */
  static diffLines(before: string, after: string): readonly string[] {
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    const lcsLengths: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
      Array.from({ length: afterLines.length + 1 }, () => 0),
    );
    for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
      for (let j = afterLines.length - 1; j >= 0; j -= 1) {
        const rowBelow = lcsLengths[i + 1];
        const row = lcsLengths[i];
        if (row === undefined || rowBelow === undefined) continue;
        row[j] =
          beforeLines[i] === afterLines[j]
            ? (rowBelow[j + 1] ?? 0) + 1
            : Math.max(rowBelow[j] ?? 0, row[j + 1] ?? 0);
      }
    }

    const lines: string[] = [];
    let i = 0;
    let j = 0;
    while (i < beforeLines.length && j < afterLines.length) {
      if (beforeLines[i] === afterLines[j]) {
        lines.push(`  ${beforeLines[i] ?? ""}`);
        i += 1;
        j += 1;
        continue;
      }
      const row = lcsLengths[i];
      const rowBelow = lcsLengths[i + 1];
      const takeFromBefore = (rowBelow?.[j] ?? 0) >= (row?.[j + 1] ?? 0);
      if (takeFromBefore) {
        lines.push(`- ${beforeLines[i] ?? ""}`);
        i += 1;
      } else {
        lines.push(`+ ${afterLines[j] ?? ""}`);
        j += 1;
      }
    }
    while (i < beforeLines.length) {
      lines.push(`- ${beforeLines[i] ?? ""}`);
      i += 1;
    }
    while (j < afterLines.length) {
      lines.push(`+ ${afterLines[j] ?? ""}`);
      j += 1;
    }
    return lines;
  }
}
