import type { SkillManifestEntry } from "@/install/steps/manifest/index.ts";

export type SkillInstallOutcome = {
  readonly skills: readonly SkillManifestEntry[];
  /** One `skill <name>` log line per skill. */
  readonly actionLines: readonly string[];
};
