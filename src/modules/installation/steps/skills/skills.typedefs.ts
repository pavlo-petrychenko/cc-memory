import type { SkillManifestEntry } from "@/modules/installation/steps/manifest/manifest.typedefs.ts";

export type SkillInstallOutcome = {
  readonly skills: readonly SkillManifestEntry[];
  /** One `skill <name>` log line per skill. */
  readonly actionLines: readonly string[];
};
