import type { NotesArgs } from "@/cli/index.ts";
import { type CliOutcome } from "@/cli/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import {
  formatNoNotes,
  formatNoteLine,
} from "@/retrieval/commands/notes/notes.formatter.ts";
import { listNotes } from "@/retrieval/store/index.ts";
import { loadRegistryForCli, resolveWorkspaceForCwd } from "@/workspace/index.ts";

/** An explicit empty `--folder ""` behaves like omitting the flag entirely. */
function normalizedFolder(folder: string | null): string | null {
  return folder === null || folder === "" ? null : folder;
}

/** `--json` is checked BEFORE the "no notes" fallback: an empty `--json`
 * result still prints `[]` rather than the plain-text "no notes" message. */
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
