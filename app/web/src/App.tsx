import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api/client.ts";
import type {
  Graph,
  KbMap,
  NoteListItem,
  NoteRead,
  SearchHit,
  WorklogNoteItem,
  WorkspaceSummary,
} from "./api/client.ts";
import { FileTree } from "./components/FileTree.tsx";
import { GraphView } from "./components/GraphView.tsx";
import { NoteViewer } from "./components/NoteViewer.tsx";
import { Playground } from "./components/Playground.tsx";

type Tab =
  | { id: string; kind: "graph"; title: string }
  | { id: string; kind: "playground"; title: string }
  | {
      id: string;
      kind: "note";
      path: string;
      title: string;
      note: NoteRead | null;
      loading: boolean;
    };

function usePersistedWorkspace(workspaces: WorkspaceSummary[]) {
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem("cc-memory:workspace") ?? "",
  );
  useEffect(() => {
    if (selectedId === "" && workspaces.length > 0) {
      const first = workspaces[0];
      if (first !== undefined) setSelectedId(first.id);
    }
  }, [workspaces, selectedId]);
  useEffect(() => {
    if (selectedId !== "") localStorage.setItem("cc-memory:workspace", selectedId);
  }, [selectedId]);
  return { selectedId, setSelectedId };
}

function resolveWikilink(
  raw: string,
  notes: NoteListItem[],
  worklogNotes: WorklogNoteItem[],
): string {
  const all = [...notes, ...worklogNotes] as NoteListItem[];
  const rawNoMd = raw.endsWith(".md") ? raw.slice(0, -3) : raw;
  const candidates = [raw, `${rawNoMd}.md`, `${rawNoMd}/${rawNoMd.split("/").pop()}.md`];
  for (const c of candidates) if (all.some((n) => n.path === c)) return c;
  const lowerRaw = rawNoMd.toLowerCase();
  const lowerCandidates = [
    lowerRaw,
    `${lowerRaw}.md`,
    `${lowerRaw}/${lowerRaw.split("/").pop()}.md`,
  ];
  for (const lc of lowerCandidates) {
    const found = all.find((n) => n.path.toLowerCase() === lc);
    if (found) return found.path;
  }
  const byTitle = all.find((n) => n.title.toLowerCase() === lowerRaw);
  if (byTitle) return byTitle.path;
  const targetLast = rawNoMd.split("/").pop()!.toLowerCase();
  const prefIdx = all.find(
    (n) => n.path.toLowerCase() === `${targetLast}/${targetLast}.md`,
  );
  if (prefIdx) return prefIdx.path;
  const byStem = all.find(
    (n) => n.path.split("/").pop()!.replace(/\.md$/, "").toLowerCase() === targetLast,
  );
  if (byStem) return byStem.path;
  const bySuffix = all.find((n) => n.path.toLowerCase().endsWith(`/${targetLast}.md`));
  if (bySuffix) return bySuffix.path;
  return raw.endsWith(".md") ? raw : `${raw}.md`;
}

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [_kbMap, setKbMap] = useState<KbMap | null>(null);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [worklogNotes, setWorklogNotes] = useState<WorklogNoteItem[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [worklogGraph, setWorklogGraph] = useState<Graph | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "graph", kind: "graph", title: "Graph view" },
    { id: "playground", kind: "playground", title: "Playground" },
  ]);
  const [activeId, setActiveId] = useState<string>("graph");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { selectedId, setSelectedId } = usePersistedWorkspace(workspaces);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? null,
    [tabs, activeId],
  );
  const activeNotePath = activeTab?.kind === "note" ? activeTab.path : null;

  useEffect(() => {
    api
      .workspaces()
      .then(setWorkspaces)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (selectedId === "") return;
    setError(null);
    api
      .kbMap(selectedId)
      .then(setKbMap)
      .catch((e: unknown) => setError(String(e)));
    api
      .notes(selectedId)
      .then(setNotes)
      .catch((e: unknown) => setError(String(e)));
    api
      .worklogNotes(selectedId)
      .then(setWorklogNotes)
      .catch((e: unknown) => setError(String(e)));
    api
      .graph(selectedId)
      .then(setGraph)
      .catch((e: unknown) => setError(String(e)));
    api
      .worklogGraph(selectedId)
      .then(setWorklogGraph)
      .catch((e: unknown) => setError(String(e)));
    setTabs([
      { id: "graph", kind: "graph", title: "Graph view" },
      { id: "playground", kind: "playground", title: "Playground" },
    ]);
    setActiveId("graph");
    setSearchHits(null);
  }, [selectedId]);

  const openNote = useCallback(
    (rawPath: string) => {
      if (selectedId === "") return;
      const path = resolveWikilink(rawPath, notes, worklogNotes);
      const tabId = `note:${path}`;
      const existing = tabs.find((t) => t.id === tabId);
      if (existing) {
        setActiveId(tabId);
        return;
      }
      const allForTitle = [...notes, ...worklogNotes] as NoteListItem[];
      const title =
        allForTitle.find((n) => n.path === path)?.title ??
        path.split("/").pop()?.replace(".md", "") ??
        path;
      setTabs((prev) => [
        ...prev,
        { id: tabId, kind: "note", path, title, note: null, loading: true },
      ]);
      setActiveId(tabId);
      api
        .note(selectedId, path)
        .then((note) => {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId ? { ...t, title: note.title, note, loading: false } : t,
            ),
          );
        })
        .catch((e: unknown) => setError(String(e)));
    },
    [selectedId, tabs, notes, worklogNotes],
  );

  const closeTab = useCallback(
    (id: string) => {
      if (id === "graph" || id === "playground") return;
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (activeId === id) {
          if (next.length === 1) setActiveId("graph");
          else if (idx >= next.length) setActiveId(next[next.length - 1]!.id);
          else setActiveId(next[idx]?.id ?? "graph");
        }
        return next;
      });
    },
    [activeId],
  );

  const runSearch = async () => {
    if (selectedId === "" || searchQuery.trim() === "") {
      setSearchHits(null);
      return;
    }
    try {
      const hits = await api.search(selectedId, searchQuery, 10);
      setSearchHits(hits);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0f1115",
        color: "#e6e8ec",
        fontFamily: "ui-monospace, SF Mono, monospace",
        overflow: "hidden",
      }}
    >
      <style>{`
        html, body { background: #0f1115; margin: 0; height: 100%; }
        * { scrollbar-width: thin; scrollbar-color: #2a303c #0f1115; }
        *::-webkit-scrollbar { width: 8px; height: 8px; }
        *::-webkit-scrollbar-track { background: #0f1115; }
        *::-webkit-scrollbar-thumb { background: #2a303c; border-radius: 999px; border: 1px solid #1e232b; }
        *::-webkit-scrollbar-thumb:hover { background: #3a4455; }
        *::-webkit-scrollbar-corner { background: #0f1115; }
      `}</style>

      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid #2a303c",
          background: "#0f1115",
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 14, letterSpacing: "-0.02em" }}>cc-memory</strong>
        <span style={{ color: "#5a6577", fontSize: 11 }}>— Obsidian for your vault</span>
        <div
          style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}
        >
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              background: "#1e232b",
              color: "#e6e8ec",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              minWidth: 180,
            }}
          >
            {workspaces.length === 0 && <option value="">(no workspaces)</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} — {w.noteCount ?? "?"} notes
              </option>
            ))}
          </select>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="Search notes…"
            style={{
              background: "#1e232b",
              color: "#e6e8ec",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              width: 220,
            }}
          />
          <button
            onClick={() => void runSearch()}
            style={{
              background: "#7c86ff",
              color: "#0f1115",
              border: "none",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </div>
      </header>

      {error !== null && (
        <div
          style={{
            margin: 8,
            padding: 10,
            background: "#3a1a1a",
            border: "1px solid #5a2a2a",
            borderRadius: 8,
            fontSize: 12,
            color: "#ff9e9e",
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {searchHits !== null && (
        <div
          style={{
            margin: "8px 12px 0",
            background: "#181b20",
            border: "1px solid #2a303c",
            borderRadius: 10,
            padding: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#8b95a5",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Search — {searchHits.length} hits{" "}
            <button
              onClick={() => setSearchHits(null)}
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "#8b95a5",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              ✕ clear
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {searchHits.length === 0 ? (
              <div style={{ fontSize: 12, color: "#5a6577" }}>(no hits)</div>
            ) : (
              searchHits.map((hit) => (
                <button
                  key={hit.path}
                  onClick={() => openNote(hit.path)}
                  style={{
                    flex: "0 0 260px",
                    textAlign: "left",
                    background: "#1e232b",
                    border: "1px solid #2a303c",
                    borderRadius: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#e6e8ec",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hit.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#5a6577",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hit.path}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#8b95a5",
                      marginTop: 4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {hit.snippet}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 0,
          minHeight: 0,
          borderTop: "1px solid #1e232b",
        }}
      >
        <aside
          style={{
            background: "#181b20",
            borderRight: "1px solid #2a303c",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px 8px",
              fontSize: 11,
              color: "#8b95a5",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: "1px solid #1e232b",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span>Explorer</span>
            <span style={{ color: "#5a6577", fontSize: 10 }}>
              {notes.length + worklogNotes.length} files
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <FileTree
              notes={notes}
              worklogNotes={worklogNotes}
              selectedPath={activeNotePath}
              onOpen={openNote}
            />
          </div>
        </aside>

        <div
          style={{
            background: "#0f1115",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* Tab bar — like Obsidian: Graph view + Playground are persistent tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              background: "#0f1115",
              borderBottom: "1px solid #2a303c",
              overflowX: "auto",
              flexShrink: 0,
              height: 36,
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeId;
              const icon =
                tab.kind === "graph" ? "⬢" : tab.kind === "playground" ? "🧪" : "📄";
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 12px",
                    borderRight: "1px solid #1e232b",
                    borderTop: isActive ? "2px solid #7c86ff" : "2px solid transparent",
                    borderBottom: "none",
                    borderLeft: "none",
                    background: isActive ? "#181b20" : "#0f1115",
                    color: isActive ? "#e6e8ec" : "#8b95a5",
                    cursor: "pointer",
                    minWidth: tab.kind === "playground" ? 130 : 140,
                    maxWidth: 220,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  <span>{icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {tab.title}
                  </span>
                  {tab.kind === "note" && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      style={{
                        marginLeft: "auto",
                        padding: "2px 6px",
                        borderRadius: 6,
                        background: isActive ? "#1e232b" : "transparent",
                        color: "#5a6577",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11, color: "#5a6577" }}>
                {tabs.filter((t) => t.kind === "note").length} notes
              </span>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "#181b20",
            }}
          >
            {activeTab?.kind === "graph" ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <GraphView
                  graph={graph}
                  worklogGraph={worklogGraph}
                  selectedPath={activeNotePath}
                  onSelect={openNote}
                />
              </div>
            ) : activeTab?.kind === "playground" ? (
              <div
                style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#0f1115" }}
              >
                <Playground workspaceId={selectedId} onOpenNote={openNote} />
              </div>
            ) : activeTab?.kind === "note" ? (
              <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                {activeTab.loading ? (
                  <div style={{ padding: 24, color: "#8b95a5", fontSize: 12 }}>
                    Loading {activeTab.path}…
                  </div>
                ) : activeTab.note ? (
                  <NoteViewer note={activeTab.note} onWikilinkClick={openNote} />
                ) : (
                  <div style={{ padding: 24, color: "#ff9e9e", fontSize: 12 }}>
                    Failed to load
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "#5a6577",
                  fontSize: 13,
                }}
              >
                Select a note
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
