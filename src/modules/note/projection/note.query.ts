import type { Workspace } from "@/core/index.ts";
import { FtsQueryBuilder, Ranker } from "@/core/index.ts";
import type { FusedHit } from "@/core/index.ts";
import { Collection, type SearchIndex } from "@/gateways/index.ts";
import { NOTE_BM25_WEIGHTS } from "@/modules/note/note.constants.ts";

export type SearchNotesOptions = {
  readonly limit?: number;
  /** `Config.linkBoost` — required rather than defaulted here, since the default
   * is `core/config`'s to own. */
  readonly linkBoost: number;
};

export const NOTE_DEFAULT_LIMIT = 5;

/** The read side of the note read model: BM25 over `notes_fts` (title ×10, tags
 * ×5, body ×1) fused with a phrase/`NEAR` query via RRF, plus the
 * link-corroboration bonus. */
export class NoteQuery {
  constructor(
    private readonly index: SearchIndex,
    private readonly ftsQueryBuilder: FtsQueryBuilder,
    private readonly ranker: Ranker,
  ) {}

  async searchFused(
    workspace: Workspace,
    query: string,
    options: SearchNotesOptions,
  ): Promise<readonly FusedHit[]> {
    const limit = options.limit ?? NOTE_DEFAULT_LIMIT;
    const pool = Math.max(limit * 3, 10);

    const tokenHits = await this.index.query(
      workspace,
      Collection.Notes,
      this.ftsQueryBuilder.ftsQuery(query),
      [...NOTE_BM25_WEIGHTS],
      pool,
    );
    if (tokenHits.length === 0) return [];

    const phraseHits = await this.index.query(
      workspace,
      Collection.Notes,
      this.ftsQueryBuilder.phraseQuery(query),
      [...NOTE_BM25_WEIGHTS],
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
