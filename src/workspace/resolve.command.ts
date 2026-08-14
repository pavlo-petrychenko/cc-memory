import type { ResolveArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome } from "../cli/CliOutcome.ts";
import { formatNoWorkspaceForCwd, formatResolveLines } from "../cli/format.ts";
import { loadRegistryForCli } from "../cli/resolveTarget.service.ts";
import { expandPath } from "../core/paths.ts";
import type { Container } from "../platform/container.ts";
import { resolveWorkspace, worktreeSlug } from "./resolver.service.ts";

/**
 * No match here returns success (exit 0) with a message, unlike
 * `search`/`notes`, whose `--workspace`-less cwd miss exits 1
 * (`resolveWorkspaceForCwd`'s `NO_WORKSPACE_FOR_CWD_MESSAGE`) — two different
 * exit behaviors for "no workspace", kept as two different code paths.
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
