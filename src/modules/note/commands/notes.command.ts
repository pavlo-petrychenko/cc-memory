import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import type { NotesArgs } from "@/modules/note/commands/notes.typedefs.ts";
import { ListNotesUseCase } from "@/modules/note/index.ts";
import { NotesFormatter } from "@/modules/note/services/notes.formatter.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

/** An explicit empty `--folder ""` behaves like omitting the flag entirely. */
function normalizedFolder(folder: string | null): string | null {
  return folder === null || folder === "" ? null : folder;
}

export class NotesCommand {
  constructor(
    private readonly listNotes: ListNotesUseCase,
    private readonly formatter: NotesFormatter,
  ) {}

  /** `--json` is checked BEFORE the "no notes" fallback: an empty `--json`
   * result still prints `[]` rather than the plain-text "no notes" message. */
  async execute(container: Gateways, args: NotesArgs): Promise<CliOutcome> {
    const home = container.env.home();
    const { repository, targetResolutionService } = makeWorkspaceContext(
      container.fs,
      container.git,
    );
    const registryResult = await repository.load(repository.defaultPath(home));
    if (!registryResult.ok) {
      return cliFailure(`registry error: ${registryResult.error.message}`);
    }

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
    const resolved = targetResolutionService.resolveWorkspaceForCwd(
      registryResult.value,
      home,
      cwd,
      args.workspace,
    );
    if (!resolved.ok) return cliFailure(resolved.error);
    const workspace = resolved.value;

    const folder = normalizedFolder(args.folder);
    const rows = await this.listNotes.run(workspace, folder ?? undefined);

    if (args.json) {
      container.stdio.write(JSON.stringify(rows, null, 2));
      return CLI_SUCCESS;
    }
    if (rows.length === 0) {
      container.stdio.write(this.formatter.noNotes(folder));
      return CLI_SUCCESS;
    }
    for (const row of rows) {
      container.stdio.write(
        this.formatter.noteLine(row.importance, row.type, row.path, row.title),
      );
    }
    return CLI_SUCCESS;
  }
}
