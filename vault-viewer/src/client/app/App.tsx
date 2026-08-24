import { useCallback, useState } from "react";

import { useExplorerState } from "../modules/explorer/hooks/useExplorerState.js";
import { useVaultTree } from "../modules/explorer/hooks/useVaultTree.js";
import { useGraph } from "../modules/graph/hooks/useGraph.js";
import { useGraphFilters } from "../modules/graph/hooks/useGraphFilters.js";
import { useGraphPhysics } from "../modules/graph/hooks/useGraphPhysics.js";
import { useKnownTargets } from "../modules/notes/hooks/useKnownTargets.js";
import { useNote } from "../modules/notes/hooks/useNote.js";
import { useWikilink } from "../modules/notes/hooks/useWikilink.js";
import { CommandPalette } from "../modules/search/components/CommandPalette.js";
import { useSearch } from "../modules/search/hooks/useSearch.js";
import { useSearchFilters } from "../modules/search/hooks/useSearchFilters.js";
import { useWorklog } from "../modules/worklog/hooks/useWorklog.js";
import { useWorklogRouting } from "../modules/worklog/hooks/useWorklogRouting.js";
import { usePaletteShortcut } from "./hooks/usePaletteShortcut.js";
import { ActivityRail } from "./layout/ActivityRail.js";
import { ExplorerPanel } from "./layout/ExplorerPanel.js";
import { MainContent } from "./layout/MainContent.js";
import { RightDock } from "./layout/RightDock.js";
import { StatusBar } from "./layout/StatusBar.js";
import { TabStrip } from "./layout/TabStrip.js";
import { TopBar } from "./layout/TopBar.js";
import { TabsProvider, useTabs } from "./providers/tabs.provider.js";
import { useTheme } from "./providers/theme.provider.js";
import { useWorkspace } from "./providers/workspace.provider.js";

type ViewMode = "note" | "graph";

/** Composition root: owns view-mode + palette state, pulls data through the
 * feature hooks, and lays the pieces out. All rendering lives in the extracted
 * layout and module components. */
function AppBody() {
  const { toggle: toggleTheme } = useTheme();
  const { workspaces, activeWs } = useWorkspace();
  const explorerState = useExplorerState();
  const { activePath, openPath, closeTab } = useTabs();

  const [mode, setMode] = useState<ViewMode>("note");
  const [q, setQ] = useState("");
  const [showPalette, setShowPalette] = useState(false);
  const [fullGraph, setFullGraph] = useState(false);
  const [depth, setDepth] = useState(1);
  const [worklogFocus, setWorklogFocus] = useState("_root");

  const searchFilters = useSearchFilters();
  const graphFilters = useGraphFilters();
  const {
    config: graphConfig,
    setConfig: setGraphConfig,
    reset: resetGraphConfig,
  } = useGraphPhysics();

  const { data: treeData } = useVaultTree(activeWs);
  const kbTree = treeData?.kbTree ?? null;
  const worklogs = treeData?.worklogs ?? [];
  const notesMeta = treeData?.notes ?? [];

  const { hits } = useSearch(activeWs, q, searchFilters.filters);
  const knownTargets = useKnownTargets(notesMeta);

  const isWorklogTimeline = useWorklogRouting(
    activePath,
    worklogs,
    setWorklogFocus,
    useCallback(() => setMode("note"), []),
  );

  const noteQuery = useNote(activeWs, activePath && !isWorklogTimeline ? activePath : "");
  const note = noteQuery.data ?? null;
  const worklogQuery = useWorklog(activeWs, worklogFocus);
  const worklogData = worklogQuery.data ?? null;
  const graphQuery = useGraph(
    activeWs,
    activePath || null,
    depth,
    fullGraph,
    Boolean(activeWs),
  );
  const graph = graphQuery.data ?? null;

  const handleWikilink = useWikilink(notesMeta, openPath);

  usePaletteShortcut(
    showPalette,
    useCallback(() => setShowPalette((v) => !v), []),
    useCallback(() => setShowPalette(false), []),
  );

  const openInPaletteAwareWay = useCallback(
    (path: string) => {
      openPath(path);
      setShowPalette(false);
    },
    [openPath],
  );

  return (
    <div className="app-frame">
      <TopBar
        q={q}
        onQChange={setQ}
        onOpenPalette={() => setShowPalette(true)}
        mode={mode}
        onModeChange={setMode}
      />
      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        q={q}
        setQ={setQ}
        filters={searchFilters}
        hits={hits}
        onOpen={openInPaletteAwareWay}
      />

      <div className="app-columns">
        <ActivityRail
          mode={mode}
          onOpenPalette={() => setShowPalette(true)}
          onOpenGraph={() => setMode("graph")}
          onToggleTheme={toggleTheme}
        />
        <ExplorerPanel
          kbTree={kbTree}
          worklogs={worklogs}
          activePath={activePath}
          noteCount={workspaces.find((w) => w.id === activeWs)?.noteCount ?? 0}
          explorerState={explorerState}
          onOpen={openPath}
          onWorklogSlug={setWorklogFocus}
        />
        <div className="main-col">
          <TabStrip />
          <MainContent
            mode={mode}
            activePath={activePath}
            isWorklogTimeline={isWorklogTimeline}
            note={note}
            worklogData={worklogData}
            graph={graph}
            fullGraph={fullGraph}
            setFullGraph={setFullGraph}
            depth={depth}
            setDepth={setDepth}
            graphFilters={graphFilters}
            graphConfig={graphConfig}
            setGraphConfig={setGraphConfig}
            resetGraphConfig={resetGraphConfig}
            worklogs={worklogs}
            worklogFocus={worklogFocus}
            onWorklogFocusChange={setWorklogFocus}
            workspace={activeWs}
            notesMeta={notesMeta}
            knownTargets={knownTargets}
            onOpen={openPath}
            onWikilink={handleWikilink}
            onCloseTab={closeTab}
            onOpenPalette={() => setShowPalette(true)}
          />
        </div>
        <div className="side-panel right">
          <RightDock
            mode={mode}
            activePath={activePath}
            isWorklogTimeline={isWorklogTimeline}
            note={note}
            worklogData={worklogData}
            worklogFocus={worklogFocus}
            graph={graph}
            onOpen={openPath}
            onWikilink={handleWikilink}
            onJumpToDate={(date) =>
              document.getElementById(date)?.scrollIntoView({ behavior: "smooth" })
            }
          />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}

export default function App() {
  const { activeWs } = useWorkspace();
  // Keyed by workspace so the tab strip re-initializes per workspace.
  return (
    <TabsProvider key={activeWs} workspaceId={activeWs}>
      <AppBody />
    </TabsProvider>
  );
}
