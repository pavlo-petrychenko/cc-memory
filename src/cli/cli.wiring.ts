import { HelpCommand } from "@/cli/help/help.command.ts";
import { HelpFormatter } from "@/cli/help/help.formatter.ts";
import { ReindexCommand } from "@/cli/reindex.command.ts";
import { ReindexFormatter } from "@/cli/reindex.formatter.ts";
import { SearchCommand } from "@/cli/search.command.ts";
import { VersionCommand } from "@/cli/version.command.ts";
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
import {
  BuildKbMapUseCase,
  KbMapService,
  ListNotesUseCase,
  NoteParser,
  NoteProjection,
  NoteQuery,
  NoteRepository,
  ReprojectNotesUseCase,
  SearchNotesUseCase,
  NotesCommand,
  NotesFormatter,
  SearchFormatter,
} from "@/modules/note/index.ts";
import { HookDispatchCommand } from "@/modules/session/index.ts";
import {
  CommitCommand,
  CommitFormatter,
  ReprojectWorklogUseCase,
  SearchWorklogUseCase,
  WorklogProjection,
  WorklogQuery,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import {
  AddWorkspaceUseCase,
  ListWorkspacesUseCase,
  makeWorkspaceContext,
  RemoveWorkspaceUseCase,
  ResolveCommand,
  ResolveFormatter,
  ResolveTargetWorkspacesUseCase,
  ResolveWorkspaceUseCase,
  WorkspaceAddCommand,
  WorkspaceFormatter,
  WorkspaceLsCommand,
  WorkspaceRmCommand,
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
    reprojectNotes: new ReprojectNotesUseCase(repository, projection),
    searchNotes: new SearchNotesUseCase(query),
    listNotes: new ListNotesUseCase(repository),
    buildKbMap: new BuildKbMapUseCase(new KbMapService(container.fs, new NoteParser())),
  };
}

function makeWorklogModule(container: Gateways, index: SearchIndex) {
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

function makeWorkspaceIndexBuilder(
  note: ReturnType<typeof makeNoteModule>,
): WorkspaceIndexBuilder {
  return {
    buildIndex: async (workspace) =>
      (await note.reprojectNotes.run(workspace, { incremental: false })).total,
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
    new WorkspaceFormatter(),
  );
  const resolveWorkspace = new ResolveWorkspaceUseCase(
    workspace.repository,
    workspace.targetResolutionService,
  );
  const resolveTargetWorkspaces = new ResolveTargetWorkspacesUseCase(
    workspace.repository,
    workspace.targetResolutionService,
  );

  const commands: readonly RegisteredCommand[] = [
    registerCommand(new WorkspaceAddCommand(addWorkspace, new WorkspaceFormatter())),
    registerCommand(new WorkspaceRmCommand(removeWorkspace, new WorkspaceFormatter())),
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
        resolveTargetWorkspaces,
        note.reprojectNotes,
        worklog.reprojectWorklog,
        new ReindexFormatter(),
      ),
    ),
    registerCommand(
      new SearchCommand(
        resolveWorkspace,
        note.searchNotes,
        worklog.searchWorklog,
        new SearchFormatter(),
      ),
    ),
    registerCommand(
      new NotesCommand(resolveWorkspace, note.listNotes, new NotesFormatter()),
    ),
    registerCommand(
      new CommitCommand(
        container.fs,
        container.proc,
        resolveTargetWorkspaces,
        new CommitFormatter(),
      ),
    ),
    registerCommand(
      new DoctorCommand(
        container,
        new DoctorService(container, note.reprojectNotes, worklog.reprojectWorklog),
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
