import { UseCase } from "@/core/index.ts";
import { expandPath, relativeTo } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { NO_HITS_MESSAGE } from "@/modules/memory/commands/searchMemory.constants.ts";
import { NoteService, SearchHitFormatter } from "@/modules/note/index.ts";
import { WorklogService } from "@/modules/worklog/index.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";

export type SearchMemoryInput = {
  readonly query: string;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly limit: number;
  readonly worklog: boolean;
};

/** One user-facing operation: fused note + worklog search. */
export class SearchMemoryUseCase extends UseCase<
  SearchMemoryInput,
  Result<readonly string[], string>
> {
  private readonly targetResolution = this.makeService(TargetResolutionService);
  private readonly noteService = this.makeService(NoteService);
  private readonly worklogService = this.makeService(WorklogService);
  private readonly formatter = new SearchHitFormatter();

  async execute(input: SearchMemoryInput): Promise<Result<readonly string[], string>> {
    const home = this.gateways.env.home();
    const cwd =
      input.cwd !== null ? expandPath(input.cwd, home) : this.gateways.env.cwd();
    const resolved = await this.targetResolution.resolveWorkspace(
      home,
      cwd,
      input.workspace,
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const workspace = resolved.value;

    const searchOptions = { limit: input.limit, linkBoost: this.config.linkBoost };
    const hits = input.worklog
      ? await this.worklogService.search(workspace, input.query, searchOptions)
      : await this.noteService.search(workspace, input.query, searchOptions);

    if (hits.length === 0) return { ok: true, value: [NO_HITS_MESSAGE] };

    const lines = hits.flatMap((hit) => {
      const relativePath = relativeTo(hit.path, workspace.kb);
      return this.formatter.hit(hit.title, relativePath, hit.snippet);
    });
    return { ok: true, value: lines };
  }
}
