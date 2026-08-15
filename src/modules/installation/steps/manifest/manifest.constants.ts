/** Bumped only if this manifest's own shape changes — unrelated to the
 * index's schema version or the registry's schema. */
export const MANIFEST_SCHEMA_VERSION = 1;

/** The `.pre-ccmemory.bak` suffix, shared by `skills.ts` (a pre-existing real
 * skill directory) and `settings.ts` (the one-time pristine `settings.json`
 * backup this installer makes before its first write). */
export const PRE_CCMEMORY_BACKUP_SUFFIX = ".pre-ccmemory.bak";
