import type { Container } from "../../container.ts";
import { expandPath } from "../../domain/paths.ts";
import { resolveWorkspace, worktreeSlug } from "../../services/resolver.service.ts";
import type { ResolveArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome } from "../CliOutcome.ts";
import { formatNoWorkspaceForCwd, formatResolveLines } from "../format.ts";
import { loadRegistryForCli } from "../resolveTarget.ts";

/**
 * `cmd_resolve` (`bin/memory:110-120`). No match is NOT a `sys.exit` — Python
 * prints a message and returns normally (exit 0), unlike `search`/`notes`,
 * whose `--workspace`-less cwd miss DOES exit 1 (`resolveWorkspaceForCwd`'s
 * `NO_WORKSPACE_FOR_CWD_MESSAGE`). Two different Python behaviors for
 * "no workspace", preserved as two different code paths here.
 */
export async function resolve(
  container: Container,
  args: ResolveArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;

  const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
  const workspace = resolveWorkspace(registryResult.value, cwd, home);
  if (workspace === null) {
    container.stdio.write(formatNoWorkspaceForCwd(cwd));
    return CLI_SUCCESS;
  }

  const slug = await worktreeSlug(container.git, cwd, workspace);
  for (const line of formatResolveLines(
    workspace.id,
    slug,
    workspace.kb,
    workspace.worklogs,
    workspace.indexDb,
  )) {
    container.stdio.write(line);
  }
  return CLI_SUCCESS;
}
