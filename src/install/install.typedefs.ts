import type { AbsPath } from "@/core/index.ts";

export type InstallOptions = {
  readonly repoRoot: AbsPath;
  readonly dryRun: boolean;
};

export enum InstallErrorKind {
  BunNotFound = "bun_not_found",
  BunUnresolvable = "bun_unresolvable",
  SettingsUnreadable = "settings_unreadable",
}

export type InstallError =
  | { readonly kind: InstallErrorKind.BunNotFound }
  | { readonly kind: InstallErrorKind.BunUnresolvable; readonly attemptedPath: string }
  | { readonly kind: InstallErrorKind.SettingsUnreadable; readonly message: string };

export type InstallReport = {
  readonly dryRun: boolean;
  /** Human-readable lines describing what was (or, under `--dry-run`, would
   * be) done — collected instead of printed inline so `install.command.ts`
   * renders them. */
  readonly actionLines: readonly string[];
  /** Only non-empty when `settings.json` actually changes. */
  readonly settingsDiffLines: readonly string[];
};

export type UninstallReport = {
  readonly uninstalled: boolean;
  readonly actionLines: readonly string[];
};
