import type { ReflectArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../cli/CliOutcome.ts";
import {
  loadRegistryForCli,
  resolveTargetWorkspaces,
} from "../cli/resolveTarget.service.ts";
import type { Container } from "../platform/container.ts";
import { runReflect } from "./run.service.ts";

/**
 * Resolves targets exactly like `reindex`/`commit`
 * (`resolveTargetWorkspaces`), then runs the reflector (`runReflect`) for
 * each. Every resolved workspace always yields `CLI_SUCCESS` regardless of
 * what the reflector itself printed. `--all` is accepted (`ReflectArgs.all`)
 * but never consulted: `_targets` already defaults to every workspace when
 * `--workspace` is omitted, so `--all` is a no-op.
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
