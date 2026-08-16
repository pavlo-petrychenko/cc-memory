import { HelpCommand } from "@/cli/commands/help/help.command.ts";
import { HelpFormatter } from "@/cli/commands/help/help.formatter.ts";
import { ReindexCommand } from "@/cli/commands/reindex/reindex.command.ts";
import { ReindexFormatter } from "@/cli/commands/reindex/reindex.formatter.ts";
import { SearchCommand } from "@/cli/commands/search/search.command.ts";
import { VersionCommand } from "@/cli/commands/version/version.command.ts";
import { FtsQueryBuilder, Ranker, TokenizerParser } from "@/core/index.ts";
import { ConfigParser } from "@/core/index.ts";
import { registerCommand } from "@/core/index.ts";
import type { RegisteredCommand } from "@/core/index.ts";
import { AppGateways, SearchIndexAdapter } from "@/gateways/index.ts";
import type { Gateways, SearchIndex } from "@/gateways/index.ts";
import {
  DoctorCommand,
  DoctorFormatter,
  DoctorService,
  InstallCommand,
  UninstallCommand,
} from "@/modules/installation/index.ts";
import { KbMapService } from "@/modules/kb/index.ts";
import {
  ListNotesUseCase,
  NoteParser,
  NoteProjection,
  NoteQuery,
  NoteRepository,
  NoteService,
  NotesCommand,
  NotesFormatter,
  SearchHitFormatter,
} from "@/modules/note/index.ts";
import { HookDispatchCommand } from "@/modules/session/index.ts";
import {
  CommitCommand,
  CommitFormatter,
  WorklogProjection,
  WorklogQuery,
  WorklogService,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import {
  AddWorkspaceUseCase,
  ListWorkspacesUseCase,
  makeWorkspaceContext,
  RemoveWorkspaceUseCase,
  ResolveCommand,
  ResolveFormatter,
  ResolveWorkspaceUseCase,
  WorkspaceAddCommand,
  WorkspaceAddFormatter,
  WorkspaceLsCommand,
  WorkspaceLsFormatter,
  WorkspaceRmCommand,
  WorkspaceRmFormatter,
} from "@/modules/workspace/index.ts";
import type { WorkspaceIndexBuilder } from "@/modules/workspace/index.ts";

function makeSearchIndex(container: Gateways): SearchIndex {
  return new SearchIndexAdapter(container.fs, (path) => container.openDatabase(path));
}

function makeNoteModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const repository = new NoteRepository(container.fs, new NoteParser());
  const projection = new NoteProjection(index);
  const query = new NoteQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    projection,
    noteService: new NoteService(repository, projection, query),
    listNotes: new ListNotesUseCase(repository),
    buildKbMap: new KbMapService(container.fs, new NoteParser()),
  };
}

function makeWorklogModule(container: Gateways, index: SearchIndex) {
  const tokenizer = new TokenizerParser();
  const store = new WorklogStoreService(container.fs, container.git);
  const projection = new WorklogProjection(index);
  const query = new WorklogQuery(index, new FtsQueryBuilder(tokenizer), new Ranker());
  return {
    store,
    worklogService: new WorklogService(store, projection, query),
  };
}

function makeWorkspaceIndexBuilder(
  note: ReturnType<typeof makeNoteModule>,
): WorkspaceIndexBuilder {
  return {
    buildIndex: async (workspace) =>
      (await note.noteService.fullReindex(workspace)).total,
    noteCount: async (workspace) => (await note.projection.listExisting(workspace)).size,
  };
}

/** The explicit command registry — every command is constructed here, never
 * self-registered. */
export type Cli = { readonly commands: readonly RegisteredCommand[] };

export function wireCli(container: Gateways): Cli {
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);
  const workspace = makeWorkspaceContext(container.fs, container.git, container.proc);
  const indexBuilder = makeWorkspaceIndexBuilder(note);

  const addWorkspace = new AddWorkspaceUseCase(
    workspace.repository,
    workspace.validatorService,
    indexBuilder,
  );
  const removeWorkspace = new RemoveWorkspaceUseCase(
    workspace.repository,
    workspace.validatorService,
  );
  const listWorkspaces = new ListWorkspacesUseCase(
    workspace.repository,
    workspace.validatorService,
    indexBuilder,
    new WorkspaceLsFormatter(),
  );
  const resolveWorkspace = new ResolveWorkspaceUseCase(
    workspace.repository,
    workspace.targetResolutionService,
  );

  const commands: readonly RegisteredCommand[] = [
    registerCommand(new WorkspaceAddCommand(addWorkspace, new WorkspaceAddFormatter())),
    registerCommand(new WorkspaceRmCommand(removeWorkspace, new WorkspaceRmFormatter())),
    registerCommand(new WorkspaceLsCommand(listWorkspaces)),
    registerCommand(
      new ResolveCommand(
        workspace.repository,
        workspace.resolverService,
        new ResolveFormatter(),
      ),
    ),
    registerCommand(
      new ReindexCommand(
        workspace.targetResolutionService,
        note.noteService,
        worklog.worklogService,
        new ReindexFormatter(),
      ),
    ),
    registerCommand(
      new SearchCommand(
        resolveWorkspace,
        note.noteService,
        worklog.worklogService,
        new SearchHitFormatter(),
      ),
    ),
    registerCommand(
      new NotesCommand(resolveWorkspace, note.listNotes, new NotesFormatter()),
    ),
    registerCommand(
      new CommitCommand(
        container.fs,
        container.proc,
        workspace.targetResolutionService,
        new CommitFormatter(),
      ),
    ),
    registerCommand(
      new DoctorCommand(
        container,
        new DoctorService(container, note.noteService, worklog.worklogService),
        new DoctorFormatter(),
      ),
    ),
    registerCommand(
      new HookDispatchCommand(
        new AppGateways(process.env),
        new ConfigParser().parse(process.env),
      ),
    ),
    registerCommand(new InstallCommand(new AppGateways(process.env))),
    registerCommand(new UninstallCommand(new AppGateways(process.env))),
    registerCommand(new HelpCommand(new HelpFormatter())),
    registerCommand(new VersionCommand()),
  ];

  return { commands };
}
