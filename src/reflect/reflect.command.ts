import type { ReflectArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../cli/CliOutcome.ts";
import {
  loadRegistryForCli,
  resolveTargetWorkspaces,
} from "../cli/resolveTarget.service.ts";
import type { Container } from "../platform/container.ts";
import { runReflect } from "./run.service.ts";

/**
 * `cmd_reflect` (`bin/memory:195-207`): resolve targets exactly like
 * `reindex`/`commit` (`resolveTargetWorkspaces`), then run the reflector
 * (`reflect/run.ts`'s `runReflect`, P8) for each. Python's own
 * `cmd_reflect` spawns `reflector.py` as a subprocess per target and never
 * inspects its exit code — `subprocess.run(argv)`'s result is discarded — so
 * this mirrors that: every resolved workspace always yields `CLI_SUCCESS`
 * regardless of what the reflector itself printed. `--all` is accepted
 * (`ReflectArgs.all`) but never consulted, matching Python's own parser: the
 * flag exists in `bin/memory:285` but `_targets` already defaults to every
 * workspace when `--workspace` is omitted, so `--all` has always been a
 * no-op there too.
 */
export async function reflect(
  container: Container,
  args: ReflectArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;

  const targets = resolveTargetWorkspaces(registryResult.value, home, args.workspace);
  if (!targets.ok) return cliFailure(targets.error);

  const perWorkspaceLines = await Promise.all(
    targets.value.map((workspace) =>
      runReflect(container, workspace, {
        ifDue: args.ifDue,
        thresholdHours: args.thresholdHours,
        headless: args.headless,
        force: args.force,
      }),
    ),
  );
  for (const lines of perWorkspaceLines) {
    for (const line of lines) container.stdio.write(line);
  }
  return CLI_SUCCESS;
}
