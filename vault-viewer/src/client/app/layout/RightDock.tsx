import type { NoteDto } from "@shared/contracts/note.contract.js";
import type { WorklogResponseDto } from "@shared/contracts/worklog.contract.js";

import { NoteDock } from "../../modules/notes/components/NoteDock.js";
import type { ResolveWikilink } from "../../modules/notes/hooks/useWikilink.js";
import { DateJumpRail } from "../../modules/worklog/components/DateJumpRail.js";
import type { GraphPayload } from "./MainContent.js";

type Props = {
  mode: "note" | "graph";
  activePath: string;
  isWorklogTimeline: boolean;
  note: NoteDto | null;
  worklogData: WorklogResponseDto | null;
  worklogFocus: string;
  graph: GraphPayload | null;
  onOpen: (path: string) => void;
  onWikilink: ResolveWikilink;
  onJumpToDate: (date: string) => void;
};

/** Right column: context panel that follows the main view's mode. */
export function RightDock(props: Props): JSX.Element {
  const {
    mode,
    activePath,
    isWorklogTimeline,
    note,
    worklogData,
    worklogFocus,
    graph,
    onOpen,
    onWikilink,
    onJumpToDate,
  } = props;

  if (mode === "graph") return <GraphInfoPanel activePath={activePath} graph={graph} />;
  if (isWorklogTimeline && worklogData) {
    return (
      <WorklogJumpPanel
        worklog={worklogData}
        focus={worklogFocus}
        onJump={onJumpToDate}
      />
    );
  }
  return <NoteDock note={note} onOpen={onOpen} onWikilink={onWikilink} />;
}

function GraphInfoPanel({
  activePath,
  graph,
}: {
  activePath: string;
  graph: GraphPayload | null;
}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
  const edges = Array.isArray(graph?.edges) ? graph.edges.length : 0;
  return (
    <>
      <div className="panel-header">Filters</div>
      <div className="panel-body">
        <div className="section-label">Graph filters</div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
          Use top bar: Depth 1/2, Full vault, and type/tag/feature filters. Click node →
          tab.
        </div>
        <div className="hint-box">
          Focus: {activePath || "—"}
          <br />
          {graph !== null ? `${nodes} nodes · ${edges} edges` : "loading"}
        </div>
      </div>
    </>
  );
}

function WorklogJumpPanel({
  worklog,
  focus,
  onJump,
}: {
  worklog: WorklogResponseDto;
  focus: string;
  onJump: (date: string) => void;
}) {
  return (
    <>
      <div className="panel-header">Worklog · {focus}</div>
      <div className="panel-body" style={{ gap: 10 }}>
        <DateJumpRail entries={worklog.entries} onJump={onJump} />
        {worklog.stateExists && <div className="pinned-note">▲ STATE.md pinned top</div>}
      </div>
    </>
  );
}
