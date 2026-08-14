import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import type { Proc } from "../platform/proc.port.ts";

/**
 * The launchd reflector agent (`tools/install.py:156-180`) — template fill +
 * `bootout` then `bootstrap` (idempotent: a `bootout` on a job that isn't
 * loaded just fails silently, matching Python's `capture_output=True` with no
 * return-code check on that call). `dev.ccmemory.reflector` and
 * `StartCalendarInterval 21:00`/`RunAtLoad` are unchanged (C6); only the
 * `ProgramArguments` template placeholders move from `@PYTHON@`/`@MEMORYSCRIPT@`
 * to `@BUN@`/`@DIST@` (`runners/dev.ccmemory.reflector.plist`).
 */

export const LAUNCHD_LABEL = "dev.ccmemory.reflector";

const LAUNCH_AGENTS_HOME_RELATIVE_PATH = "~/Library/LaunchAgents";
const LOCAL_BIN_HOME_RELATIVE_PATH = "~/.local/bin";
const REFLECTOR_LOG_HOME_RELATIVE_PATH = "~/.claude/memory/reflector.log";

const UID_TIMEOUT_MS = 5_000;
const LAUNCHCTL_TIMEOUT_MS = 10_000;

export function defaultLaunchAgentsDir(home: AbsPath): AbsPath {
  return expandPath(LAUNCH_AGENTS_HOME_RELATIVE_PATH, home);
}

export function defaultPlistPath(home: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal filename (no `/`, `.` or `..` of its
  // own) onto an already-absolute, normalized directory path.
  return `${defaultLaunchAgentsDir(home)}/${LAUNCHD_LABEL}.plist` as AbsPath;
}

export function defaultReflectorLogPath(home: AbsPath): AbsPath {
  return expandPath(REFLECTOR_LOG_HOME_RELATIVE_PATH, home);
}

/** `tools/install.py:162-163`'s `path_env` — launchd's own `PATH` is minimal,
 * so the reflector needs `~/.local/bin` (for `claude`/`memory`) plus every
 * common `git` install location spelled out explicitly. */
export function launchdPathEnv(home: AbsPath): string {
  const localBin = expandPath(LOCAL_BIN_HOME_RELATIVE_PATH, home);
  return [
    localBin,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

export type PlistTemplateValues = {
  readonly bunPath: string;
  readonly distPath: string;
  readonly pathEnv: string;
  readonly logPath: string;
};

/** `tools/install.py:164-172`'s placeholder substitution, ported onto the
 * `@BUN@`/`@DIST@` template (see this file's doc comment). */
export function renderPlist(template: string, values: PlistTemplateValues): string {
  return template
    .replaceAll("@BUN@", values.bunPath)
    .replaceAll("@DIST@", values.distPath)
    .replaceAll("@PATH@", values.pathEnv)
    .replaceAll("@LOG@", values.logPath);
}

/** `<repoRoot>/runners/dev.ccmemory.reflector.bun.plist` — the checked-in
 * template `renderPlist` fills in. */
export function defaultPlistTemplatePath(repoRoot: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal relative path onto an already-absolute,
  // normalized `repoRoot`.
  return `${repoRoot}/runners/${LAUNCHD_LABEL}.bun.plist` as AbsPath;
}

/** `id -u` via `Proc` — `os.getuid()` (`tools/install.py:177`) has no direct
 * port equivalent (every real OS call in this codebase goes through `Proc`
 * or `FileSystem`), so this shells out the same way `Git`'s adapter does for
 * every other OS fact. */
export async function currentUid(proc: Proc): Promise<string> {
  const result = await proc.run("id", ["-u"], { timeoutMs: UID_TIMEOUT_MS });
  return result.stdout.trim();
}

function launchctlTarget(uid: string): string {
  return `gui/${uid}/${LAUNCHD_LABEL}`;
}

export type LaunchdInstallOutcome = {
  readonly loaded: boolean;
  /** `tools/install.py:180`'s log line. */
  readonly actionLine: string;
};

/**
 * Write the rendered plist, then `bootout` (ignoring its result — there may
 * be nothing loaded yet) followed by `bootstrap`
 * (`tools/install.py:173-180`). Returns `null`, doing nothing, when the
 * template file itself is missing — matches `tools/install.py:158-159`'s
 * `if not os.path.isfile(tmpl): return`.
 */
export async function installLaunchd(
  fs: FileSystem,
  proc: Proc,
  repoRoot: AbsPath,
  home: AbsPath,
  values: PlistTemplateValues,
): Promise<LaunchdInstallOutcome | null> {
  const templatePath = defaultPlistTemplatePath(repoRoot);
  if (!(await fs.exists(templatePath))) return null;

  const template = await fs.readFile(templatePath);
  const rendered = renderPlist(template, values);
  const plistPath = defaultPlistPath(home);
  await fs.mkdir(defaultLaunchAgentsDir(home));
  await fs.writeFile(plistPath, rendered);

  const uid = await currentUid(proc);
  await proc.run("launchctl", ["bootout", launchctlTarget(uid)], {
    timeoutMs: LAUNCHCTL_TIMEOUT_MS,
  });
  const bootstrapResult = await proc.run(
    "launchctl",
    ["bootstrap", `gui/${uid}`, plistPath],
    {
      timeoutMs: LAUNCHCTL_TIMEOUT_MS,
    },
  );
  const loaded = bootstrapResult.exitCode === 0;
  const status = loaded ? "loaded" : "installed (load manually)";
  return { loaded, actionLine: `launchd agent ${status} -> ${plistPath}` };
}

/** `launchctl print gui/<uid>/<label>` exits 0 iff the job is currently
 * loaded — used by `doctor.service.ts`, never by the installer itself
 * (which always re-bootstraps unconditionally). */
export async function isLaunchdLoaded(proc: Proc): Promise<boolean> {
  const uid = await currentUid(proc);
  const result = await proc.run("launchctl", ["print", launchctlTarget(uid)], {
    timeoutMs: LAUNCHCTL_TIMEOUT_MS,
  });
  return result.exitCode === 0;
}

/** `launchctl bootout` for `uninstall` — best-effort, same as the installer's
 * own pre-`bootstrap` call. */
export async function uninstallLaunchd(
  fs: FileSystem,
  proc: Proc,
  plistPath: AbsPath,
): Promise<void> {
  const uid = await currentUid(proc);
  await proc.run("launchctl", ["bootout", launchctlTarget(uid)], {
    timeoutMs: LAUNCHCTL_TIMEOUT_MS,
  });
  await fs.remove(plistPath);
}
