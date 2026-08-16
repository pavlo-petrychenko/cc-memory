import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { SearchIndexAdapter } from "@/gateways/index.ts";
import type { Gateways, SearchIndex } from "@/gateways/index.ts";
import { KbMapService } from "@/modules/kb/index.ts";
import {
  ListNotesUseCase,
  NoteParser,
  NoteProjection,
  NoteQuery,
  NoteRepository,
  ReprojectNotesUseCase,
  SearchNotesUseCase,
} from "@/modules/note/index.ts";
import {
  ReprojectWorklogUseCase,
  SearchWorklogUseCase,
  WorklogProjection,
  WorklogQuery,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";

/** The same wiring `cli/main.ts` performs, exposed for tests that need real
 * note/worklog use cases over a fixture container. */
export function makeSearchIndex(container: Gateways): SearchIndex {
  return new SearchIndexAdapter(container.fs, (path) => container.openDatabase(path));
}

export function makeNoteModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const repository = new NoteRepository(container.fs, new NoteParser());
  const projection = new NoteProjection(index);
  const query = new NoteQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    projection,
    reprojectNotes: new ReprojectNotesUseCase(repository, projection),
    searchNotes: new SearchNotesUseCase(query),
    listNotes: new ListNotesUseCase(repository),
    buildKbMap: new KbMapService(container.fs, new NoteParser()),
  };
}

export function makeWorklogModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const store = new WorklogStoreService(container.fs, container.git);
  const projection = new WorklogProjection(index);
  const query = new WorklogQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    store,
    reprojectWorklog: new ReprojectWorklogUseCase(store, projection),
    searchWorklog: new SearchWorklogUseCase(query),
  };
}
