import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { Result } from "../core/Result.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import { HookName } from "../session/HookName.ts";
import { HookEvent } from "../session/HookResult.ts";
import {
  isJsonArray,
  isJsonObject,
  isJsonString,
  type JsonFileError,
  type JsonObject,
  type JsonValue,
  readJsonObjectFile,
  writeJsonObjectAtomic,
} from "./json.service.ts";
import { PRE_CCMEMORY_BACKUP_SUFFIX } from "./manifest.service.ts";

/**
 * `~/.claude/settings.json` surgery (`tools/install.py:90-143`) — purge our
 * own hook groups (by manifest, [[bugfixes]] #4), re-register the 5 hooks at
 * their current location, and preserve every foreign entry (buddy-reroll,
 * plan-review, anything else a user has installed) byte-for-byte.
 */

// A literal `~/`-prefix — matches every other `*_HOME_RELATIVE_PATH` constant
// in this codebase (`registry.service.ts`, `manifest.ts`).
const SETTINGS_HOME_RELATIVE_PATH = "~/.claude/settings.json";

export function defaultSettingsPath(home: AbsPath): AbsPath {
  return expandPath(SETTINGS_HOME_RELATIVE_PATH, home);
}

export function defaultSettingsBackupPath(home: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal suffix to an absolute, normalized path
  // introduces no `~`, `.` or `..` segment.
  return `${defaultSettingsPath(home)}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath;
}

/** `event -> (hook name for "memory hook <name>", timeout seconds)`
 * (`tools/install.py:33-39`'s `HOOKS` dict, [[reference]]'s "Hook registration
 * + timeouts": `SessionStart 10s`, the other four `15s`). Iteration order
 * matches the Python dict literal — it decides where a brand-new event key
 * lands in `settings.json`'s `hooks` object (see `registerOurHooks` below). */
export const hookRegistrations: readonly {
  readonly event: HookEvent;
  readonly name: HookName;
  readonly timeoutSeconds: number;
}[] = [
  { event: HookEvent.SessionStart, name: HookName.SessionStart, timeoutSeconds: 10 },
  { event: HookEvent.UserPromptSubmit, name: HookName.MemoryInject, timeoutSeconds: 15 },
  { event: HookEvent.Stop, name: HookName.WrapGate, timeoutSeconds: 15 },
  { event: HookEvent.PostCompact, name: HookName.CompactCheckpoint, timeoutSeconds: 15 },
  { event: HookEvent.SessionEnd, name: HookName.WorklogFloor, timeoutSeconds: 15 },
];

/** `<abs-bun> <repo>/dist/memory.js hook <name>` ([[contracts]]'s C6
 * deviation #2). */
export function hookCommand(bunPath: string, distPath: string, hookName: string): string {
  return `${bunPath} ${distPath} hook ${hookName}`;
}

/** `tools/install.py:106`'s `_is_ours` substring test, kept as a one-time
 * fallback for entries the Python-era installer left behind (before this
 * manifest existed at all) — [[bugfixes]] #4. */
const LEGACY_HOOK_SUBSTRINGS = ["cc-memory", "obsidian-kb-index.py"];

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

export type HookPurgeSummary = {
  readonly purgedByManifestCount: number;
  readonly purgedByLegacyCount: number;
};

/** Named return contract for `purgeOurHooks` — an inline object-literal return
 * type discards the evidence TypeScript already has (anti-slop
 * `no-known-value-widening`); this is that owner type. */
type PurgeHooksResult = {
  readonly hooks: JsonObject;
  readonly summary: HookPurgeSummary;
};

/** Named return contract for `registerOurHooks`, same reasoning as
 * `PurgeHooksResult` above. */
type RegisterHooksResult = {
  readonly hooks: JsonObject;
  readonly hookCommands: Readonly<Record<string, string>>;
};

/**
 * Remove every hook GROUP this installer owns from `hooksByEvent`
 * (`tools/install.py:117-129`'s purge loop) — first by exact former command
 * string (`manifestCommands`, [[bugfixes]] #4: survives a moved/renamed
 * repo), then — only when `runLegacyPurge` — by the Python-era substring
 * test, so a settings.json that predates the manifest still gets cleaned up
 * exactly once. An event whose only groups were ours drops the key entirely
 * (`del hooks[event]`, `tools/install.py:126`), matching Python precisely.
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
 * Re-register the 5 hooks at their current location (`tools/install.py:130-137`).
 * Appends a fresh group to whichever array already survived the purge for
 * that event (preserving both the event key's position in `hooksByEvent` and
 * any foreign groups already in it); a brand-new event key is inserted in
 * `hookRegistrations` order, at the end — the same place Python's
 * `hooks.setdefault(event, [])` would put it during that loop.
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

export type HookSurgeryResult = {
  readonly settings: JsonObject;
  readonly hookCommands: Readonly<Record<string, string>>;
  readonly summary: HookPurgeSummary;
};

/** The whole `settings.json` surgery, pure over an already-loaded document:
 * purge, then re-register. Split out from I/O (`loadSettings`/`saveSettings`
 * below, orchestrated by `run.ts`) so the merge logic itself is trivially
 * table-tested. */
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

/** `tools/install.py:127-129`'s log line, verbatim pluralization
 * (`"y" if removed == 1 else "ies"`). */
export function purgeSummaryLine(summary: HookPurgeSummary): string | null {
  const removed = summary.purgedByManifestCount + summary.purgedByLegacyCount;
  if (removed === 0) return null;
  const suffix = removed === 1 ? "y" : "ies";
  return `purged ${removed} stale cc-memory/legacy hook entr${suffix}`;
}

/** `tools/install.py:137`'s log line, one per registered hook. */
export function hookRegisteredLine(event: HookEvent, hookName: string): string {
  return `hook ${event} -> ${hookName}`;
}

export const HOOK_REGISTRATION_ORDER: readonly {
  readonly event: HookEvent;
  readonly name: string;
}[] = hookRegistrations.map(({ event, name }) => ({ event, name }));

export async function loadSettings(
  fs: FileSystem,
  path: AbsPath,
): Promise<Result<JsonObject, JsonFileError>> {
  return readJsonObjectFile(fs, path);
}

/**
 * Back up the raw (unparsed) `settings.json` bytes ONCE — before this
 * installer's very first write (`tools/install.py` never did this at all).
 * `alreadyBackedUp` comes from the manifest's `settingsBackupPath`: once it is
 * non-null, every later install run skips this regardless of whether the file
 * on disk still exists, so a user deleting the backup by hand can't trigger a
 * second, now-already-mutated "pristine" copy.
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
