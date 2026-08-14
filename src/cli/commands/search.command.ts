import type { Container } from "../../container.ts";
import type { Config } from "../../domain/Config.ts";
import { expandPath } from "../../domain/paths.ts";
import { SearchKind, searchFused } from "../../services/index/search.ts";
import type { SearchArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../CliOutcome.ts";
import { formatSearchHit, NO_HITS_MESSAGE } from "../format.ts";
import { loadRegistryForCli, resolveWorkspaceForCwd } from "../resolveTarget.ts";

/** `os.path.relpath(h["path"], ws["kb"]) if h["path"].startswith(ws["kb"]) else
 * h["path"]` (`bin/memory:151`) — every indexed path is always under `kb`, so
 * this is prefix-stripping, not full relpath resolution (`..` segments never
 * occur in practice, same reasoning as `services/index/notes.ts`'s
 * `relativeToKb`, which this duplicates rather than imports — it's private
 * there). */
function relativeToKb(path: string, kb: string): string {
  const prefix = `${kb}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** `cmd_search` (`bin/memory:139-152`). */
export async function search(
  container: Container,
  config: Config,
  args: SearchArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;

  const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
  const resolved = resolveWorkspaceForCwd(
    registryResult.value,
    home,
    cwd,
    args.workspace,
  );
  if (!resolved.ok) return cliFailure(resolved.error);
  const workspace = resolved.value;

  const hits = await searchFused(container, workspace, args.query, {
    limit: args.limit,
    kind: args.worklog ? SearchKind.Worklog : SearchKind.Notes,
    linkBoost: config.linkBoost,
  });

  if (hits.length === 0) {
    container.stdio.write(NO_HITS_MESSAGE);
    return CLI_SUCCESS;
  }
  for (const hit of hits) {
    const relativePath = relativeToKb(hit.path, workspace.kb);
    for (const line of formatSearchHit(hit.title, relativePath, hit.snippet)) {
      container.stdio.write(line);
    }
  }
  return CLI_SUCCESS;
}
