import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure, flagValue, hasFlag } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { NOTES_DESCRIPTOR } from "@/modules/note/commands/notes.constants.ts";
import { NotesFormatter } from "@/modules/note/index.ts";
import { ListNotesUseCase } from "@/modules/note/index.ts";
import { ResolveWorkspaceUseCase } from "@/modules/workspace/index.ts";

export type NotesOptions = {
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly folder: string | null;
  readonly json: boolean;
};

function normalizedFolder(folder: string | null): string | null {
  return folder === null || folder === "" ? null : folder;
}

@Command(NOTES_DESCRIPTOR)
export class NotesCommand implements CommandContract<NotesOptions> {
  constructor(
    private readonly resolveWorkspace: ResolveWorkspaceUseCase,
    private readonly listNotes: ListNotesUseCase,
    private readonly formatter: NotesFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<NotesOptions, ArgsError> {
    return {
      ok: true,
      value: {
        workspace: flagValue(tokens, "--workspace"),
        cwd: flagValue(tokens, "--cwd"),
        folder: flagValue(tokens, "--folder"),
        json: hasFlag(tokens, "--json"),
      },
    };
  }

  async run(options: NotesOptions, context: RunContext): Promise<CommandResult> {
    const cwd =
      options.cwd !== null ? expandPath(options.cwd, context.home) : context.cwd;
    const resolved = await this.resolveWorkspace.run(context.home, {
      cwd,
      explicitId: options.workspace,
    });
    if (!resolved.ok) return { lines: [], ...cliFailure(resolved.error) };
    const workspace = resolved.value;

    const folder = normalizedFolder(options.folder);
    const rows = await this.listNotes.run(workspace, folder ?? undefined);

    if (options.json) {
      return { lines: [JSON.stringify(rows, null, 2)], ...CLI_SUCCESS };
    }
    if (rows.length === 0) {
      return { lines: [this.formatter.noNotes(folder)], ...CLI_SUCCESS };
    }
    return {
      lines: rows.map((row) =>
        this.formatter.noteLine(row.importance, row.type, row.path, row.title),
      ),
      ...CLI_SUCCESS,
    };
  }
}
