export { buildIndex } from "@/retrieval/store/indexBuild/index.ts";
export type { BuildOptions, BuildStats } from "@/retrieval/store/indexBuild/index.ts";
export { openIndexDb } from "@/retrieval/store/connection/index.ts";
export type { IndexConnection } from "@/retrieval/store/connection/index.ts";
export { listNotes } from "@/retrieval/store/noteList/index.ts";
export type { NoteSummary } from "@/retrieval/store/noteList/index.ts";
export {
  NOTES_SEARCH_SQL,
  search,
  searchFused,
  SearchKind,
} from "@/retrieval/store/search/index.ts";
export type {
  SearchFusedOptions,
  SearchOptions,
} from "@/retrieval/store/search/index.ts";
export { SCHEMA } from "@/retrieval/store/schema/index.ts";
