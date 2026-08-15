import type { AbsPath } from "@/core/index.ts";
import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import type { Sqlite } from "@/platform/index.ts";
import { FtsQueryBuilder } from "@/retrieval/query/ftsQuery/ftsQuery.builder.ts";
import { Ranker } from "@/retrieval/ranking/ranking.ranker.ts";
import { SearchKind, type FusedHit, type Hit } from "@/retrieval/retrieval.typedefs.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import { LinkGraphService } from "@/retrieval/store/graph/graph.service.ts";
import {
  DEFAULT_KIND,
  DEFAULT_LIMIT,
  SEARCH_SQL,
} from "@/retrieval/store/search/search.constants.ts";
import type {
  SearchFusedOptions,
  SearchOptions,
  SearchRow,
} from "@/retrieval/store/search/search.typedefs.ts";

function collapseWhitespace(text: string): string {
  return text
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .join(" ");
}

/** An empty query short-circuits to `[]`; an FTS5 syntax error is swallowed to `[]`
 * rather than thrown — this is what makes a natural prompt containing
 * `OR`/`AND`/`NEAR`/quotes always safe to search with. */
function runMatch(
  db: Sqlite,
  matchQuery: string,
  limit: number,
  kind: SearchKind,
): readonly Hit[] {
  if (matchQuery.trim() === "") return [];
  try {
    const rows = db.query<SearchRow>(SEARCH_SQL[kind], [matchQuery, limit]);
    return rows.map((row) => ({
      path: absPath(row.path),
      title: row.title,
      snippet: collapseWhitespace(row.snip),
      score: row.score,
    }));
  } catch {
    return [];
  }
}

export class SearchService {
  constructor(
    private readonly connectionService: IndexConnectionService,
    private readonly ftsQueryBuilder: FtsQueryBuilder,
    private readonly ranker: Ranker,
    private readonly linkGraphService: LinkGraphService,
  ) {}

  async search(
    container: Container,
    workspace: Workspace,
    query: string,
    options: SearchOptions = {},
  ): Promise<readonly Hit[]> {
    const { db } = await this.connectionService.open(container, workspace);
    return runMatch(
      db,
      this.ftsQueryBuilder.ftsQuery(query),
      options.limit ?? DEFAULT_LIMIT,
      options.kind ?? DEFAULT_KIND,
    );
  }

  /** Fuses a token-OR ranking with a phrase/`NEAR` ranking via RRF, plus a small
   * wikilink-corroboration bonus. Returns `[]` early when the token query yields no
   * candidates — phrase hits are always a subset of token hits. */
  async searchFused(
    container: Container,
    workspace: Workspace,
    query: string,
    options: SearchFusedOptions,
  ): Promise<readonly FusedHit[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const kind = options.kind ?? DEFAULT_KIND;
    const links = options.links ?? true;
    const pool = Math.max(limit * 3, 10); // candidate pool size before fusion

    const { db } = await this.connectionService.open(container, workspace);
    const tokenHits = runMatch(db, this.ftsQueryBuilder.ftsQuery(query), pool, kind);
    if (tokenHits.length === 0) return [];

    const phraseHits = runMatch(db, this.ftsQueryBuilder.phraseQuery(query), pool, kind);
    const phraseRanks = new Map(phraseHits.map((hit, index) => [hit.path, index]));
    const inlinks = links
      ? await this.linkGraphService.inlinkCounts(
          container,
          workspace,
          tokenHits.map((hit) => hit.path),
        )
      : new Map<AbsPath, number>();

    return this.ranker.fuse({
      tokenHits,
      phraseRanks,
      inlinks,
      linkBoost: options.linkBoost,
      limit,
    });
  }
}
