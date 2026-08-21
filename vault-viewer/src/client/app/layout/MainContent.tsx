import type { NoteDto } from "@shared/contracts/note.contract.js";
import type { WorklogResponseDto } from "@shared/contracts/worklog.contract.js";
import type { NoteMetaDto, TreeNodeDto, WorklogSlugDto } from "@shared/contracts/tree.contract.js";
import { GraphView } from "../../modules/graph/components/GraphView.js";
import type { UseGraphFiltersReturn } from "../../modules/graph/hooks/useGraphFilters.js";
import type { GraphConfig } from "../../modules/graph/hooks/useGraphPhysics.js";
import { EmptyState, NotFoundState } from "../../modules/notes/components/NoteStates.js";
import { NoteView } from "../../modules/notes/components/NoteView.js";
import type { ResolveWikilink } from "../../modules/notes/hooks/useWikilink.js";
import { WorklogTimeline } from "../../modules/worklog/components/WorklogTimeline.js";

/** The graph payload shape App hands to GraphView. */
export type GraphPayload = {
  nodes: { id: string; title: string; type: string; importance: number | null; tags: string[] | string }[];
  edges: { source: string; target: string; relationType: string }[];
};

type Props = {
  mode: "note" | "graph";
  activePath: string;
  isWorklogTimeline: boolean;
  note: NoteDto | null;
  worklogData: WorklogResponseDto | null;
  graph: GraphPayload | null;
  fullGraph: boolean;
  setFullGraph: (v: boolean) => void;
  depth: number;
  setDepth: (n: number) => void;
  graphFilters: UseGraphFiltersReturn;
  graphConfig: GraphConfig;
  setGraphConfig: React.Dispatch<React.SetStateAction<GraphConfig>>;
  resetGraphConfig: () => void;
  worklogs: readonly WorklogSlugDto[];
  worklogFocus: string;
  onWorklogFocusChange: (slug: string) => void;
  workspace: string;
  notesMeta: readonly NoteMetaDto[];
  kbTree?: TreeNodeDto | null;
  knownTargets: ReadonlySet<string>;
  onOpen: (path: string, newTab?: boolean) => void;
  onWikilink: ResolveWikilink;
  onCloseTab: (path: string) => void;
  onOpenPalette: () => void;
};

/** The center column's view switch: graph / worklog timeline / empty /
 * not-found / note. Purely presentational routing over props — every data
 * access happens above it in App. */
export function MainContent(props: Props): JSX.Element {
  const {
    mode,
    activePath,
    isWorklogTimeline,
    note,
    worklogData,
    graph,
    fullGraph,
    setFullGraph,
    depth,
    setDepth,
    graphFilters,
    graphConfig,
    setGraphConfig,
    resetGraphConfig,
    worklogs,
    worklogFocus,
    onWorklogFocusChange,
    workspace,
    notesMeta,
    knownTargets,
    onOpen,
    onWikilink,
    onCloseTab,
    onOpenPalette,
  } = props;

  if (mode === "graph") {
    return (
      <GraphView
        graph={graph}
        focus={activePath || null}
        onSelect={onOpen}
        full={fullGraph}
        setFull={setFullGraph}
        depth={depth}
        setDepth={setDepth}
        typeFilter={graphFilters.typeFilter}
        tagFilter={graphFilters.tagFilter}
        featureFilter={graphFilters.featureFilter}
        setTypeFilter={graphFilters.setTypeFilter}
        setTagFilter={graphFilters.setTagFilter}
        setFeatureFilter={graphFilters.setFeatureFilter}
        config={graphConfig}
        setConfig={setGraphConfig}
        onResetConfig={resetGraphConfig}
      />
    );
  }
  if (isWorklogTimeline && worklogData) {
    return (
      <WorklogTimeline
        worklog={worklogData}
        activePath={activePath}
        worklogs={worklogs}
        worklogFocus={worklogFocus}
        onWorklogFocusChange={onWorklogFocusChange}
        workspace={workspace}
        onWikilink={onWikilink}
        knownTargets={knownTargets}
      />
    );
  }
  if (!activePath) {
    return (
      <EmptyState
        suggestions={notesMeta.slice(0, 4)}
        onOpen={onOpen}
        onOpenPalette={onOpenPalette}
      />
    );
  }
  if (note) {
    return (
      <NoteView
        note={note}
        workspace={workspace}
        onWikilink={onWikilink}
        knownTargets={knownTargets}
      />
    );
  }
  return <NotFoundState path={activePath} onClose={() => onCloseTab(activePath)} />;
}
