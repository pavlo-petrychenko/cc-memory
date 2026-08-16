import type { Workspace } from "@/core/index.ts";
import type { FusedHit } from "@/core/index.ts";
import { WorklogQuery } from "@/modules/worklog/projection/worklog.query.ts";

export type SearchWorklogOptions = {
  readonly limit?: number;
  readonly linkBoost: number;
};

/** One user-facing operation: ranked search over the worklog index. */
export class SearchWorklogUseCase {
  constructor(private readonly query: WorklogQuery) {}

  run(
    workspace: Workspace,
    query: string,
    options: SearchWorklogOptions,
  ): Promise<readonly FusedHit[]> {
    return this.query.searchFused(workspace, query, options);
  }
}
