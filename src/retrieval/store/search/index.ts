export { SearchKind } from "@/retrieval/retrieval.typedefs.ts";
export {
  NOTES_SEARCH_SQL,
  WORKLOG_SEARCH_SQL,
} from "@/retrieval/store/search/search.constants.ts";
export { search, searchFused } from "@/retrieval/store/search/search.service.ts";
export type {
  SearchFusedOptions,
  SearchOptions,
} from "@/retrieval/store/search/search.typedefs.ts";
