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
  /** RRF bonus per corroborating in-link — `Config.linkBoost`
   * (`CCMEM_LINK_BOOST`). Required rather than defaulted here: the default
   * (`0.003`) is `core/Config.ts`'s to own, not re-derived in this file. */
  readonly linkBoost: number;
};
