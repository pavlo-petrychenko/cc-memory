import type { ReindexArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../cli/CliOutcome.ts";
import { formatReindexLine } from "../cli/format.ts";
import {
  loadRegistryForCli,
  resolveTargetWorkspaces,
} from "../cli/resolveTarget.service.ts";
import type { Container } from "../platform/container.ts";
import { buildIndex } from "./build.service.ts";

/** One line per target workspace, printed in registry order (`Promise.all`
 * preserves that order in its result array even though the builds run
 * concurrently). */
export async function reindex(
  container: Container,
  args: ReindexArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;

  const targets = resolveTargetWorkspaces(registryResult.value, home, args.workspace);
  if (!targets.ok) return cliFailure(targets.error);

  const lines = await Promise.all(
    targets.value.map(async (workspace) => {
      const stats = await buildIndex(container, workspace, { incremental: !args.full });
      return formatReindexLine(
        workspace.id,
        stats.added,
        stats.updated,
        stats.removed,
        stats.total,
      );
    }),
  );
  for (const line of lines) container.stdio.write(line);
  return CLI_SUCCESS;
}
