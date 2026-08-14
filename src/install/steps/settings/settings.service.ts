import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { PRE_CCMEMORY_BACKUP_SUFFIX } from "@/install/steps/manifest/index.ts";
import {
  hookRegistrations,
  LEGACY_HOOK_SUBSTRINGS,
} from "@/install/steps/settings/settings.constants.ts";
import { SETTINGS_HOME_RELATIVE_PATH } from "@/install/steps/settings/settings.constants.ts";
import type {
  HookPurgeSummary,
  HookSurgeryResult,
  PurgeHooksResult,
  RegisterHooksResult,
} from "@/install/steps/settings/settings.typedefs.ts";
import {
  isJsonArray,
  isJsonObject,
  isJsonString,
  type JsonFileError,
  type JsonObject,
  type JsonValue,
  readJsonObjectFile,
  writeJsonObjectAtomic,
} from "@/install/utils/jsonFile/index.ts";
import type { FileSystem } from "@/platform/index.ts";
import type { HookEvent } from "@/session/index.ts";

/**
 * `~/.claude/settings.json` surgery — purge our own hook groups (by
 * manifest), re-register the 5 hooks at their current location, and preserve
 * every foreign entry (any other tool's config a user has installed)
 * byte-for-byte.
 */

export function defaultSettingsPath(home: AbsPath): AbsPath {
  return expandPath(SETTINGS_HOME_RELATIVE_PATH, home);
}

export function defaultSettingsBackupPath(home: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal suffix to an absolute, normalized path
  // introduces no `~`, `.` or `..` segment.
  return `${defaultSettingsPath(home)}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath;
}

/** `<abs-bun> <repo>/dist/memory.js hook <name>`. */
export function hookCommand(bunPath: string, distPath: string, hookName: string): string {
  return `${bunPath} ${distPath} hook ${hookName}`;
}

/** The `command` string of every `{type,command,timeout}` entry inside one
 * hook group, tolerant of anything that doesn't match the expected shape
 * (a foreign tool's group is preserved either way — this is only used to
 * decide whether a group is OURS, never to reconstruct it). */
export function commandsInGroup(group: JsonValue): readonly string[] {
  if (!isJsonObject(group)) return [];
  const hooksField = group["hooks"];
  if (hooksField === undefined || !isJsonArray(hooksField)) return [];
  const commands: string[] = [];
  for (const hookEntry of hooksField) {
    if (!isJsonObject(hookEntry)) continue;
    const command = hookEntry["command"];
    if (command !== undefined && isJsonString(command)) commands.push(command);
  }
  return commands;
}

/**
 * Remove every hook GROUP this installer owns from `hooksByEvent` — first by
 * exact former command string (`manifestCommands`: survives a moved/renamed
 * repo), then — only when `runLegacyPurge` — by the legacy substring test, so
 * a settings.json that predates the manifest still gets cleaned up exactly
 * once. An event whose only groups were ours drops the key entirely.
 */
function purgeOurHooks(
  hooksByEvent: JsonObject,
  manifestCommands: ReadonlySet<string>,
  runLegacyPurge: boolean,
): PurgeHooksResult {
  let purgedByManifestCount = 0;
  let purgedByLegacyCount = 0;
  const keptEntries: [string, JsonValue][] = [];

  for (const [event, groupsValue] of Object.entries(hooksByEvent)) {
    if (!isJsonArray(groupsValue)) {
      keptEntries.push([event, groupsValue]); // not our shape — leave untouched
      continue;
    }
    const afterManifestPurge = groupsValue.filter((group) => {
      const isOurs = commandsInGroup(group).some((command) =>
        manifestCommands.has(command),
      );
      if (isOurs) purgedByManifestCount += 1;
      return !isOurs;
    });
    const afterLegacyPurge = runLegacyPurge
      ? afterManifestPurge.filter((group) => {
          const isLegacy = commandsInGroup(group).some((command) =>
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

/**
 * Re-register the 5 hooks at their current location. Appends a fresh group
 * to whichever array already survived the purge for that event (preserving
 * both the event key's position in `hooksByEvent` and any foreign groups
 * already in it); a brand-new event key is inserted in `hookRegistrations`
 * order, at the end.
 */
function registerOurHooks(
  hooksByEvent: JsonObject,
  bunPath: string,
  distPath: string,
): RegisterHooksResult {
  // A plain mutable `Map` (never spread inside the loop below — oxc's
  // `no-accumulating-spread`: re-spreading an object on every iteration is
  // quadratic) — converted back to a `JsonObject` once, after the loop.
  const hooks = new Map<string, JsonValue>(Object.entries(hooksByEvent));
  const hookCommands: Record<string, string> = {};

  for (const registration of hookRegistrations) {
    const command = hookCommand(bunPath, distPath, registration.name);
    hookCommands[registration.event] = command;
    const existing = hooks.get(registration.event);
    const existingGroups =
      existing !== undefined && isJsonArray(existing) ? existing : [];
    const newGroup: JsonObject = {
      hooks: [{ type: "command", command, timeout: registration.timeoutSeconds }],
    };
    hooks.set(registration.event, [...existingGroups, newGroup]);
  }

  return { hooks: Object.fromEntries(hooks), hookCommands };
}

/** The whole `settings.json` surgery, pure over an already-loaded document:
 * purge, then re-register. Split out from I/O (`loadSettings`/`saveSettings`
 * below, orchestrated by `install.service.ts`) so the merge logic itself is
 * trivially table-tested. */
export function surgerizeSettings(
  settings: JsonObject,
  manifestCommands: ReadonlySet<string>,
  runLegacyPurge: boolean,
  bunPath: string,
  distPath: string,
): HookSurgeryResult {
  const existingHooksField = settings["hooks"];
  const existingHooks =
    existingHooksField !== undefined && isJsonObject(existingHooksField)
      ? existingHooksField
      : {};
  const { hooks: purgedHooks, summary } = purgeOurHooks(
    existingHooks,
    manifestCommands,
    runLegacyPurge,
  );
  const { hooks: finalHooks, hookCommands } = registerOurHooks(
    purgedHooks,
    bunPath,
    distPath,
  );
  return { settings: { ...settings, hooks: finalHooks }, hookCommands, summary };
}

/** The purge summary log line, with correct singular/plural pluralization. */
export function purgeSummaryLine(summary: HookPurgeSummary): string | null {
  const removed = summary.purgedByManifestCount + summary.purgedByLegacyCount;
  if (removed === 0) return null;
  const suffix = removed === 1 ? "y" : "ies";
  return `purged ${removed} stale cc-memory/legacy hook entr${suffix}`;
}

/** One log line per registered hook. */
export function hookRegisteredLine(event: HookEvent, hookName: string): string {
  return `hook ${event} -> ${hookName}`;
}

export async function loadSettings(
  fs: FileSystem,
  path: AbsPath,
): Promise<Result<JsonObject, JsonFileError>> {
  return readJsonObjectFile(fs, path);
}

/**
 * Back up the raw (unparsed) `settings.json` bytes ONCE — before this
 * installer's very first write. `alreadyBackedUp` comes from the manifest's
 * `settingsBackupPath`: once it is non-null, every later install run skips
 * this regardless of whether the file on disk still exists, so a user
 * deleting the backup by hand can't trigger a second, now-already-mutated
 * "pristine" copy.
 */
export async function backupSettingsIfNeeded(
  fs: FileSystem,
  settingsPath: AbsPath,
  backupPath: AbsPath,
  alreadyBackedUp: boolean,
): Promise<boolean> {
  if (alreadyBackedUp) return false;
  if (!(await fs.exists(settingsPath))) return false;
  const rawContent = await fs.readFile(settingsPath);
  await fs.writeFile(backupPath, rawContent);
  return true;
}

export async function saveSettings(
  fs: FileSystem,
  path: AbsPath,
  settings: JsonObject,
): Promise<void> {
  await writeJsonObjectAtomic(fs, path, settings);
}

/**
 * A minimal unified-diff-style comparison of two texts, line by line, via a
 * plain O(n·m) LCS table — `settings.json` is a handful of lines even with
 * every hook group, so this is well within budget. Used only by `--dry-run`
 * to show the reviewer exactly what would change, never by the real write
 * path (`saveSettings` above writes the serialized JSON directly).
 */
export function diffLines(before: string, after: string): readonly string[] {
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
