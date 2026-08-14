import type { Container } from "../../container.ts";
import { expandPath } from "../../domain/paths.ts";
import { listNotes } from "../../services/index/notes.ts";
import type { NotesArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../CliOutcome.ts";
import { formatNoNotes, formatNoteLine } from "../format.ts";
import { loadRegistryForCli, resolveWorkspaceForCwd } from "../resolveTarget.ts";

/** `a.folder` treated as falsy for both `None` and `""` (`bin/memory:172,45`
 * in `list_notes`) — an explicit empty `--folder ""` behaves like omitting
 * the flag entirely. */
function normalizedFolder(folder: string | null): string | null {
  return folder === null || folder === "" ? null : folder;
}

/** `cmd_notes` (`bin/memory:165-176`). `--json` is checked BEFORE the
 * "no notes" fallback, matching Python's `if a.json: ...; return` running
 * before the plain-text branch — an empty `--json` result still prints `[]`. */
export async function notes(container: Container, args: NotesArgs): Promise<CliOutcome> {
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

  const folder = normalizedFolder(args.folder);
  const rows = await listNotes(container, workspace, folder ?? undefined);

  if (args.json) {
    container.stdio.write(JSON.stringify(rows, null, 2));
    return CLI_SUCCESS;
  }
  if (rows.length === 0) {
    container.stdio.write(formatNoNotes(folder));
    return CLI_SUCCESS;
  }
  for (const row of rows) {
    container.stdio.write(formatNoteLine(row.importance, row.type, row.path, row.title));
  }
  return CLI_SUCCESS;
}
