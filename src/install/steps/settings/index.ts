export {
  backupSettingsIfNeeded,
  commandsInGroup,
  defaultSettingsBackupPath,
  defaultSettingsPath,
  diffLines,
  hookCommand,
  hookRegisteredLine,
  loadSettings,
  purgeSummaryLine,
  saveSettings,
  surgerizeSettings,
} from "@/install/steps/settings/settings.service.ts";
export {
  HOOK_REGISTRATION_ORDER,
  hookRegistrations,
} from "@/install/steps/settings/settings.constants.ts";
export type {
  HookPurgeSummary,
  HookSurgeryResult,
} from "@/install/steps/settings/settings.typedefs.ts";
