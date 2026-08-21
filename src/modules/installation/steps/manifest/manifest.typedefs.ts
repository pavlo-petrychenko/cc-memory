export type SkillManifestEntry = {
  readonly name: string;
  readonly backedUp: boolean;
};

export type InstalledManifest = {
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
  /** pi artifacts, recorded only when the `pi` target was installed. Absent on
   * manifests written before pi support, which reads as "not installed". */
  readonly piExtensionPath?: string | null;
  readonly piSkills?: readonly SkillManifestEntry[];
};
