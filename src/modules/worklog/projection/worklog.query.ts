import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Projection } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import type { FusedHit } from "@/core/index.ts";
import { Collection, type SearchIndex } from "@/gateways/index.ts";
import { WORKLOG_BM25_WEIGHTS } from "@/modules/worklog/worklog.constants.ts";

export type SearchWorklogOptions = {
  readonly limit?: number;
  readonly linkBoost: number;
};

export const WORKLOG_DEFAULT_LIMIT = 5;

/** The read side of the worklog read model: BM25 over `worklog_fts` (slug ×3,
 * date ×1, body ×1) fused with a phrase/`NEAR` query via RRF. */
export class WorklogQuery extends Projection {
  private readonly index: SearchIndex;
  private readonly ftsQueryBuilder: FtsQueryBuilder;
  private readonly ranker: Ranker;

  constructor(ctx: AppContext) {
    super(ctx);
    this.index = ctx.searchIndex;
    this.ftsQueryBuilder = new FtsQueryBuilder(new TokenizerParser());
    this.ranker = new Ranker();
  }

  async searchFused(
    workspace: Workspace,
    query: string,
    options: SearchWorklogOptions,
  ): Promise<readonly FusedHit[]> {
    const limit = options.limit ?? WORKLOG_DEFAULT_LIMIT;
    const pool = Math.max(limit * 3, 10);

    const tokenHits = await this.index.query(
      workspace,
      Collection.Worklog,
      this.ftsQueryBuilder.ftsQuery(query),
      [...WORKLOG_BM25_WEIGHTS],
      pool,
    );
    if (tokenHits.length === 0) return [];

    const phraseHits = await this.index.query(
      workspace,
      Collection.Worklog,
      this.ftsQueryBuilder.phraseQuery(query),
      [...WORKLOG_BM25_WEIGHTS],
      pool,
    );
    const phraseRanks = new Map(phraseHits.map((hit, index) => [hit.path, index]));
    const inlinks = await this.index.neighbors(
      workspace,
      tokenHits.map((hit) => hit.path),
    );

    return this.ranker.fuse({
      tokenHits,
      phraseRanks,
      inlinks,
      linkBoost: options.linkBoost,
      limit,
    });
  }
}
