import { UseCase, expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { NotesFormatter } from "@/modules/memory/commands/notes.formatter.ts";
import { NoteRepository } from "@/modules/note/index.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";

export type ListNotesInput = {
  readonly cwd: string | null;
  readonly explicitId: string | null;
  readonly folder: string | null;
  readonly json: boolean;
};

/** One user-facing operation: enumerate the vault's notes. */
export class ListNotesUseCase extends UseCase<
  ListNotesInput,
  Result<readonly string[], string>
> {
  private readonly targetResolution = this.makeService(TargetResolutionService);
  private readonly repository = this.makeRepository(NoteRepository);
  private readonly formatter = new NotesFormatter();

  async execute(input: ListNotesInput): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const cwd =
      input.cwd !== null ? expandPath(input.cwd, home) : this.gateways.env.cwd();
    const resolved = await this.targetResolution.resolveWorkspace(
      home,
      cwd,
      input.explicitId,
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const workspace = resolved.value;

    const folder = input.folder === null || input.folder === "" ? null : input.folder;
    const rows = await this.repository.list(workspace, folder ?? undefined);

    if (input.json) return { ok: true, value: [JSON.stringify(rows, null, 2)] };
    if (rows.length === 0) return { ok: true, value: [this.formatter.noNotes(folder)] };
    return {
      ok: true,
      value: rows.map((row) =>
        this.formatter.noteLine(row.importance, row.type, row.path, row.title),
      ),
    };
  }
}
