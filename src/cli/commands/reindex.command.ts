import type { Container } from "../../container.ts";
import { buildIndex } from "../../services/index/build.ts";
import type { ReindexArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../CliOutcome.ts";
import { formatReindexLine } from "../format.ts";
import { loadRegistryForCli, resolveTargetWorkspaces } from "../resolveTarget.ts";

/** `cmd_reindex` (`bin/memory:132-136`) — one line per target workspace,
 * printed in registry order (`Promise.all` over `_targets(a)` preserves that
 * order in its result array even though the builds run concurrently). */
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
