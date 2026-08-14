import type { ReindexArgs } from "@/cli/index.ts";
import { type CliOutcome } from "@/cli/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { formatReindexLine } from "@/retrieval/commands/reindex/reindex.formatter.ts";
import { buildIndex } from "@/retrieval/store/index.ts";
import { loadRegistryForCli, resolveTargetWorkspaces } from "@/workspace/index.ts";

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
