export type SkillManifestEntry = {
  readonly name: string;
  readonly backedUp: boolean;
};

/** The installation record persisted to `installed.json` — a manifest of exactly
 * what the installer wrote last time, so uninstall and hook purge can reverse it. */
export type Installation = {
  readonly schemaVersion: number;
  readonly repoRoot: string;
  readonly bunPath: string;
  readonly distPath: string;
  /** The exact command last registered for each `HookEvent` — the purge-by-manifest
   * key. */
  readonly hookCommands: Readonly<Record<string, string>>;
  readonly shimPath: string;
  readonly skills: readonly SkillManifestEntry[];
  readonly settingsBackupPath: string | null;
  readonly legacyPurgeDone: boolean;
};
