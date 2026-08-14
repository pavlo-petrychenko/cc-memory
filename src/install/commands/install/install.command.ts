import type { InstallArgs } from "@/cli/index.ts";
import { type CliOutcome } from "@/cli/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import {
  INSTALL_BANNER,
  INSTALL_DONE_MESSAGE,
  INSTALL_DRY_RUN_BANNER,
  INSTALL_DRY_RUN_DONE_MESSAGE,
  SETTINGS_DIFF_HEADER,
  UNINSTALL_BANNER,
  UNINSTALL_NOTHING_MESSAGE,
} from "@/install/commands/install/install.constants.ts";
import { runInstall, runUninstall } from "@/install/install.service.ts";
import { type InstallError, InstallErrorKind } from "@/install/install.typedefs.ts";
import type { Container } from "@/platform/index.ts";
import { makeRealContainer } from "@/platform/index.ts";

/**
 * `memory install [--dry-run]` / `memory uninstall`.
 *
 * `main.ts` dispatches to `install(parsed)` and `uninstall()` with no
 * `Container` argument, unlike every other command. Both functions take
 * `container` as an OPTIONAL trailing parameter instead, defaulting to a
 * fresh real one — `main.ts`'s call sites stay valid untouched, while a test
 * supplies `makeTestContainer(...)` explicitly (`proc: procFake`, `fs` seeded
 * under a faked `$HOME`) and never triggers the real default at all. This is
 * the seam that makes these two functions safe to exercise directly:
 * `runInstall`/`runUninstall` write to the user's real home directory
 * through `container.proc` — on the real container that is a real mutation of
 * this machine's state, so every test
 * passes an explicit fake container instead.
 */

/**
 * `<repoRoot>/dist/memory.js` is exactly two path segments below the repo
 * root, and `import.meta.url` resolves to the URL of the FINAL bundle at
 * runtime regardless of which original source file references it. This
 * assumption is safe because the only real invocation of `install`/
 * `uninstall` is the built artifact (`bun dist/memory.js install "$@"`,
 * never the unbundled `src/cli/main.ts`) — every test exercises
 * `install.service.ts` directly with an explicit `repoRoot` instead, so this
 * function is never under test itself. Duplicated in `doctor.command.ts`
 * rather than shared, matching this codebase's convention for a tiny
 * path-only helper (see `workspace.command.ts`'s `parentDirectory` doc
 * comment).
 */
function repoRootFromRunningFile(): AbsPath {
  const runningFilePath = new URL(import.meta.url).pathname;
  const distDir = runningFilePath.slice(0, runningFilePath.lastIndexOf("/"));
  const repoRoot = distDir.slice(0, distDir.lastIndexOf("/"));
  // SAFETY: `dist/memory.js` is always written two path segments below the
  // repo root by `bun run build` — see the doc comment above.
  return repoRoot as AbsPath;
}

function installErrorMessage(error: InstallError): string {
  switch (error.kind) {
    case InstallErrorKind.BunNotFound:
      return "bun not found on PATH ('which bun' failed) — install bun first";
    case InstallErrorKind.BunUnresolvable:
      return (
        `could not resolve a real bun binary from '${error.attemptedPath}' — ` +
        "refusing to record an ephemeral path"
      );
    case InstallErrorKind.SettingsUnreadable:
      return error.message;
  }
}

export async function install(
  args: InstallArgs,
  container: Container = makeRealContainer(process.env),
): Promise<CliOutcome> {
  const repoRoot = repoRootFromRunningFile();
  const result = await runInstall(container, { repoRoot, dryRun: args.dryRun });
  if (!result.ok) return cliFailure(installErrorMessage(result.error));

  const report = result.value;
  container.stdio.write(report.dryRun ? INSTALL_DRY_RUN_BANNER : INSTALL_BANNER);
  if (report.settingsDiffLines.length > 0) {
    container.stdio.write(SETTINGS_DIFF_HEADER);
    for (const line of report.settingsDiffLines) container.stdio.write(line);
  }
  for (const line of report.actionLines) container.stdio.write(line);
  container.stdio.write(
    report.dryRun ? INSTALL_DRY_RUN_DONE_MESSAGE : INSTALL_DONE_MESSAGE,
  );
  return CLI_SUCCESS;
}

export async function uninstall(
  container: Container = makeRealContainer(process.env),
): Promise<CliOutcome> {
  const report = await runUninstall(container);
  container.stdio.write(
    report.uninstalled ? UNINSTALL_BANNER : UNINSTALL_NOTHING_MESSAGE,
  );
  if (report.uninstalled) {
    for (const line of report.actionLines) container.stdio.write(line);
  }
  return CLI_SUCCESS;
}
