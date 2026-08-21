import type { AbsPath } from "@/core/index.ts";

/** Which agent hosts `install` wires cc-memory into. Values are the exact
 * `--agents` spellings. */
export enum AgentTarget {
  ClaudeCode = "claude",
  Pi = "pi",
}

export type InstallOptions = {
  readonly repoRoot: AbsPath;
  readonly dryRun: boolean;
  /** Absent means every known target — the default install wires both. */
  readonly targets?: readonly AgentTarget[];
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
  /** The targets this run actually resolved to (after the default expansion). */
  readonly targets: readonly AgentTarget[];
  readonly actionLines: readonly string[];
  /** Only non-empty when `settings.json` actually changes. */
  readonly settingsDiffLines: readonly string[];
};

export type UninstallReport = {
  readonly uninstalled: boolean;
  readonly actionLines: readonly string[];
};
