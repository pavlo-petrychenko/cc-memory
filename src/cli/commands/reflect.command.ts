import type { Container } from "../../container.ts";
import type { ReflectArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../CliOutcome.ts";
import { formatReflectNotImplemented } from "../format.ts";
import { loadRegistryForCli, resolveTargetWorkspaces } from "../resolveTarget.ts";

/**
 * `cmd_reflect` (`bin/memory:195-207`) STUB — P8 owns the real reflector
 * (`gather_candidates`, the `is_due` cursor, the `claude -p` decision step,
 * the tmux consolidation session). This resolves targets EXACTLY like Python
 * (`_targets`, shared with `reindex`/`commit` via `resolveTargetWorkspaces`),
 * so `--workspace no-such-id` still fails with the identical message and exit
 * code — but for a workspace that DOES exist, it reports plainly that
 * reflection hasn't been ported yet instead of pretending to gather
 * candidates or consolidate anything.
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

  for (const workspace of targets.value) {
    container.stdio.write(formatReflectNotImplemented(workspace.id));
  }
  return CLI_SUCCESS;
}
