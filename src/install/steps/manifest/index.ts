export {
  defaultManifestPath,
  loadManifest,
  saveManifest,
  serializeManifest,
} from "@/install/steps/manifest/manifest.service.ts";
export {
  MANIFEST_SCHEMA_VERSION,
  PRE_CCMEMORY_BACKUP_SUFFIX,
} from "@/install/steps/manifest/manifest.constants.ts";
export type {
  InstalledManifest,
  SkillManifestEntry,
} from "@/install/steps/manifest/manifest.typedefs.ts";
