import type { SearchKind } from "@/retrieval/retrieval.typedefs.ts";

export type SearchRow = {
  readonly path: string;
  readonly title: string;
  readonly snip: string;
  readonly score: number;
};

export type SearchOptions = {
  readonly limit?: number;
  readonly kind?: SearchKind;
};

export type SearchFusedOptions = SearchOptions & {
  /** Include the wikilink-corroboration bonus. Default `true`. */
  readonly links?: boolean;
  /** `Config.linkBoost` — required rather than defaulted here, since the default
   * is `core/config`'s to own. */
  readonly linkBoost: number;
};
