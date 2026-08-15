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
  /** True once the one-time legacy substring purge has run — see
   * `manifest.service.ts`'s doc comment. */
  readonly legacyPurgeDone: boolean;
};
