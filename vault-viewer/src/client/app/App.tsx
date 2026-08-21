import { useCallback, useEffect, useMemo, useState } from "react";

import { Explorer } from "../modules/explorer/components/Explorer.js";
import { useExplorerState } from "../modules/explorer/hooks/useExplorerState.js";
import { useVaultTree } from "../modules/explorer/hooks/useVaultTree.js";
import { GraphView } from "../modules/graph/components/GraphView.js";
import { useGraph } from "../modules/graph/hooks/useGraph.js";
import { useGraphFilters } from "../modules/graph/hooks/useGraphFilters.js";
import { useGraphPhysics } from "../modules/graph/hooks/useGraphPhysics.js";
import { Markdown } from "../modules/markdown/components/Markdown.js";
import { useKnownTargets } from "../modules/notes/hooks/useKnownTargets.js";
import { useNote } from "../modules/notes/hooks/useNote.js";
import { useWikilink } from "../modules/notes/hooks/useWikilink.js";
import { useSearch } from "../modules/search/hooks/useSearch.js";
import { useSearchFilters } from "../modules/search/hooks/useSearchFilters.js";
import { useWorklog } from "../modules/worklog/hooks/useWorklog.js";
import { reindex as reindexApi } from "../services/api/workspaces.api.js";
import type { Tab } from "./providers/tabs.provider.js";
import { useTheme } from "./providers/theme.provider.js";
import { useWorkspace } from "./providers/workspace.provider.js";

export default function App() {
  const { theme, toggle } = useTheme();
  const { workspaces, activeWs, setActiveWs } = useWorkspace();
  const explorerState = useExplorerState();

  const { data: treeData } = useVaultTree(activeWs);
  const kbTree = treeData?.kbTree ?? null;
  const worklogs = treeData?.worklogs ?? [];
  const notesMeta = treeData?.notes ?? [];

  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tabs:seed") ?? "[]") as Tab[];
    } catch {
      return [];
    }
  });
  const [activePath, setActivePath] = useState<string>("");
  const [mode, setMode] = useState<"note" | "graph">("note");
  const [q, setQ] = useState<string>("");
  const [showPalette, setShowPalette] = useState<boolean>(false);
  const [fullGraph, setFullGraph] = useState<boolean>(false);
  const [depth, setDepth] = useState<number>(1);
  const [worklogFocus, setWorklogFocus] = useState<string>("_root");
  const [toast, setToast] = useState<string>("");

  const searchFilters = useSearchFilters();
  const graphFilters = useGraphFilters();
  const {
    config: graphConfig,
    setConfig: setGraphConfig,
    reset: resetGraphConfig,
  } = useGraphPhysics();

  const {
    typeFilter,
    tagFilter,
    featureFilter,
    filters: searchApiFilters,
  } = searchFilters;
  const { hits } = useSearch(activeWs, q, searchApiFilters);

  const knownTargets = useKnownTargets(notesMeta);

  const isWorklogTimeline = useMemo(() => {
    if (!activePath) return false;
    const slug = activePath.split("/")[0] ?? "";
    return worklogs.some((w) => w.slug === slug);
  }, [activePath, worklogs]);

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

  // restore tabs per workspace when activeWs changes
  useEffect(() => {
    if (!activeWs) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`tabs:${activeWs}`) ?? "[]") as Tab[];
      if (saved.length) setTabs(saved);
    } catch {
      // ignore
    }
  }, [activeWs]);

  // persist tabs
  useEffect(() => {
    if (activeWs) localStorage.setItem(`tabs:${activeWs}`, JSON.stringify(tabs));
  }, [tabs, activeWs]);

  // handle worklog timeline when activePath is STATE or date
  useEffect(() => {
    if (!activePath || !activeWs) return;
    const isStateOrDate =
      activePath.endsWith("STATE.md") ||
      /^\d{4}-\d{2}-\d{2}\.md$/.test(activePath.split("/").pop() ?? "");
    if (!isStateOrDate) return;
    const slug = activePath.split("/")[0] ?? "";
    const isWorklogPath = worklogs.some((w) => w.slug === slug);
    if (isWorklogPath) {
      setWorklogFocus(slug);
      setMode("note");
    }
  }, [activePath, activeWs, worklogs]);

  // keyboard Cmd+K / Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if (e.key === "Escape") setShowPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openPath = useCallback((path: string, _newTab = false): void => {
    setTabs((prev) => {
      if (prev.some((t) => t.relPath === path)) return prev;
      const title = path.split("/").pop()?.replace(".md", "") ?? path;
      return [...prev, { relPath: path, title }];
    });
    setActivePath(path);
    setShowPalette(false);
  }, []);

  const closeTab = useCallback(
    (path: string, e?: React.MouseEvent): void => {
      e?.stopPropagation();
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.relPath === path);
        const next = prev.filter((t) => t.relPath !== path);
        if (path === activePath) {
          const fallback = next[idx] ?? next[idx - 1] ?? next[0];
          if (fallback) setActivePath(fallback.relPath);
          else setActivePath("");
        }
        return next;
      });
    },
    [activePath],
  );

  const handleWikilink = useWikilink(notesMeta, openPath);

  const handleReindex = useCallback(async (): Promise<void> => {
    if (!activeWs) return;
    setToast("Reindexing…");
    try {
      const r = await reindexApi(activeWs);
      setToast(`Reindexed: ${r.total} notes`);
    } catch {
      setToast("Reindex done");
    }
    setTimeout(() => setToast(""), 2500);
  }, [activeWs]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 36,
          background: "var(--panel)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              background: "var(--accent)",
              borderRadius: 2,
              display: "inline-block",
            }}
          />
          <select
            value={activeWs}
            onChange={(e) => setActiveWs(e.target.value)}
            style={{
              background: "var(--panel2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 12,
              fontFamily: "Fragment Mono",
            }}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                ◈ {w.id} — {w.tildifiedKb}
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 11,
              color: "var(--muted)",
              border: "1px solid var(--border)",
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--panel2)",
            }}
          >
            {workspaces.find((w) => w.id === activeWs)?.noteCount ?? 0} notes
          </span>
        </div>

        <div
          style={{
            flex: 1,
            maxWidth: 480,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 10px",
            color: "var(--muted)",
          }}
        >
          <span style={{ opacity: 0.6 }}>⌕</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShowPalette(true);
            }}
            onFocus={() => setShowPalette(true)}
            placeholder="Search  titles, tags, body…  (⌘K)"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--text)",
              fontSize: 12,
              fontFamily: "Fragment Mono",
            }}
          />
          <kbd
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: 10,
            }}
          >
            ⌘K
          </kbd>
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
        >
          <div
            style={{
              display: "flex",
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setMode("note")}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                background: mode === "note" ? "var(--accent)" : "transparent",
                color: mode === "note" ? "#fff" : "var(--muted)",
                border: 0,
                cursor: "pointer",
              }}
            >
              Notes
            </button>
            <button
              onClick={() => setMode("graph")}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                background: mode === "graph" ? "var(--accent)" : "transparent",
                color: mode === "graph" ? "#fff" : "var(--muted)",
                border: 0,
                cursor: "pointer",
              }}
            >
              Graph
            </button>
          </div>
          <button
            onClick={toggle}
            style={{
              width: 32,
              height: 28,
              display: "grid",
              placeItems: "center",
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              cursor: "pointer",
            }}
            title="Toggle theme"
          >
            {theme === "dark" ? "◐" : "☀"}
          </button>
        </div>
      </div>

      {/* Palette */}
      {showPalette && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            zIndex: 30,
            display: "grid",
            placeItems: "start center",
            paddingTop: 80,
          }}
          onClick={() => setShowPalette(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 640,
              maxWidth: "90vw",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 16px 48px rgba(0,0,0,.4)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ color: "var(--muted)" }}>⌕</span>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search notes…  type:spec tag:auth"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  color: "var(--text)",
                  fontSize: 13,
                  fontFamily: "Fragment Mono",
                }}
              />
              <button
                onClick={() => setShowPalette(false)}
                style={{
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 11,
                  color: "var(--muted)",
                  cursor: "pointer",
                }}
              >
                ESC
              </button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderBottom: "1px solid var(--border)",
                background: "var(--panel2)",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                Filters
              </span>
              <input
                value={typeFilter}
                onChange={(e) => searchFilters.setTypeFilter(e.target.value)}
                placeholder="type:spec"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 11,
                  color: "var(--text)",
                  fontFamily: "Fragment Mono",
                  width: 90,
                }}
              />
              <input
                value={tagFilter}
                onChange={(e) => searchFilters.setTagFilter(e.target.value)}
                placeholder="tag:auth"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 11,
                  color: "var(--text)",
                  fontFamily: "Fragment Mono",
                  width: 90,
                }}
              />
              <input
                value={featureFilter}
                onChange={(e) => searchFilters.setFeatureFilter(e.target.value)}
                placeholder="feature:auth"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 11,
                  color: "var(--text)",
                  fontFamily: "Fragment Mono",
                  width: 110,
                }}
              />
              {(typeFilter || tagFilter || featureFilter) && (
                <button
                  onClick={() => searchFilters.clear()}
                  style={{
                    marginLeft: "auto",
                    background: "transparent",
                    border: 0,
                    color: "var(--muted)",
                    fontSize: 11,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto", padding: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  padding: "6px 8px",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                }}
              >
                Results · {hits.length}
              </div>
              {hits.map((h) => (
                <div
                  key={h.relPath}
                  onClick={() => openPath(h.relPath)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: "1px solid transparent",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--panel2)")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      fontSize: 10,
                    }}
                  >
                    ≡
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                      {h.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.snippet} <span style={{ opacity: 0.6 }}>— {h.relPath}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      padding: "2px 6px",
                      borderRadius: 10,
                      color: "var(--muted)",
                    }}
                  >
                    {h.type}
                  </span>
                </div>
              ))}
              {hits.length === 0 && q.trim() && (
                <div
                  style={{
                    padding: "20px 14px",
                    color: "var(--muted)",
                    textAlign: "center",
                    fontSize: 12,
                  }}
                >
                  No hits — try different terms or filters
                </div>
              )}
              {!q.trim() && !searchFilters.hasFilters && (
                <div
                  style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 11 }}
                >
                  Tips:{" "}
                  <code
                    style={{
                      background: "var(--panel2)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    tag:jwt
                  </code>{" "}
                  <code
                    style={{
                      background: "var(--panel2)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    type:spec
                  </code>{" "}
                  · Press Enter to open top hit
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "44px 260px 1fr 300px",
          minHeight: 0,
        }}
      >
        {/* Rail */}
        <div
          style={{
            width: 44,
            background: "var(--panel)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "10px 0",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "var(--accent)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            ◧
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              color: "var(--muted)",
              fontSize: 13,
              borderRadius: 6,
              background: q ? "var(--panel2)" : "transparent",
            }}
            onClick={() => setShowPalette(true)}
            title="Search"
          >
            ⌕
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              color: mode === "graph" ? "#fff" : "var(--muted)",
              background: mode === "graph" ? "var(--accent)" : "transparent",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
            onClick={() => setMode("graph")}
            title="Graph"
          >
            ⬡
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              color: "var(--muted)",
              fontSize: 13,
            }}
            title="Worklogs"
          >
            ≡
          </div>
          <div
            style={{
              marginTop: "auto",
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              color: "var(--muted)",
              fontSize: 13,
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
            onClick={toggle}
            title="Theme"
          >
            ◐
          </div>
        </div>

        {/* Left */}
        <div
          style={{
            background: "var(--panel)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 32,
              display: "flex",
              alignItems: "center",
              padding: "0 10px",
              borderBottom: "1px solid var(--border)",
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "var(--accent)",
                borderRadius: 2,
                display: "inline-block",
              }}
            />{" "}
            Explorer
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                background: "var(--panel2)",
                border: "1px solid var(--border)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              {workspaces.find((w) => w.id === activeWs)?.noteCount ?? 0}
            </span>
          </div>
          <Explorer
            kbTree={kbTree}
            worklogs={worklogs}
            active={activePath}
            onOpen={openPath}
            onWorklogSlug={setWorklogFocus}
            state={explorerState}
          />
        </div>

        {/* Main */}
        <div
          style={{
            background: "var(--bg)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* Tabs */}
          <div
            style={{
              height: 32,
              background: "var(--panel)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "stretch",
              gap: 2,
              padding: "0 6px",
              overflowX: "auto",
            }}
          >
            {tabs.map((t) => (
              <div
                key={t.relPath}
                onClick={() => setActivePath(t.relPath)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 10px",
                  fontSize: 12,
                  background: t.relPath === activePath ? "var(--bg)" : "var(--panel)",
                  color: t.relPath === activePath ? "var(--text)" : "var(--muted)",
                  borderRight: "1px solid var(--border)",
                  borderBottom:
                    t.relPath === activePath
                      ? "1px solid var(--bg)"
                      : "1px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  borderTop:
                    t.relPath === activePath
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                }}
              >
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  {t.relPath.includes("STATE") ? "◆" : "≡"}
                </span>
                {t.title}
                <span
                  onClick={(e) => closeTab(t.relPath, e)}
                  style={{
                    width: 14,
                    height: 14,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 3,
                    fontSize: 10,
                    marginLeft: 4,
                    opacity: 0.6,
                  }}
                  role="button"
                >
                  ×
                </span>
              </div>
            ))}
            {tabs.length === 0 && (
              <div
                style={{
                  padding: "0 10px",
                  display: "flex",
                  alignItems: "center",
                  color: "var(--muted)",
                  fontSize: 11,
                }}
              >
                No open notes — pick from Explorer or ⌘K
              </div>
            )}
          </div>

          {/* Content */}
          {mode === "graph" ? (
            <GraphView
              graph={graph}
              focus={activePath || null}
              onSelect={openPath}
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
          ) : isWorklogTimeline && worklogData ? (
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "16px 0",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 720, maxWidth: "92%" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <select
                    value={worklogFocus}
                    onChange={(e) => setWorklogFocus(e.target.value)}
                    style={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontFamily: "Fragment Mono",
                    }}
                  >
                    {worklogs.map((w) => (
                      <option key={w.slug} value={w.slug}>
                        ▾ {w.slug}
                      </option>
                    ))}
                  </select>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      padding: "3px 7px",
                      borderRadius: 4,
                    }}
                  >
                    {worklogData.entries.length} entries
                  </span>
                  <span
                    style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}
                  >
                    {activePath}
                  </span>
                </div>
                {worklogData.stateExists && (
                  <div
                    style={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--amber)",
                      borderRadius: 8,
                      padding: "14px 16px",
                      marginBottom: 14,
                      boxShadow: "0 2px 12px rgba(0,0,0,.15)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "var(--amber)",
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          background: "var(--amber)",
                          borderRadius: 2,
                          display: "inline-block",
                        }}
                      />{" "}
                      STATE.md — pinned
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
                      <Markdown
                        body={worklogData.stateBody ?? ""}
                        workspace={activeWs}
                        currentPath={`${worklogFocus}/STATE.md`}
                        onWikilink={handleWikilink}
                        knownTargets={knownTargets}
                      />
                    </div>
                  </div>
                )}
                {worklogData.entries.map((e) => (
                  <div
                    key={e.relPath}
                    id={e.date}
                    style={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "14px 16px",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 11,
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontFamily: "Fragment Mono",
                        }}
                      >
                        {e.date}
                      </span>
                      <span
                        style={{ width: 24, height: 1, background: "var(--border)" }}
                      />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {e.relPath}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
                      <Markdown
                        body={e.body}
                        workspace={activeWs}
                        currentPath={e.relPath}
                        onWikilink={handleWikilink}
                        knownTargets={knownTargets}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !activePath ? (
            <div
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                padding: 40,
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              <div>
                <div style={{ fontSize: 28, marginBottom: 10, color: "var(--faint)" }}>
                  ▸
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  No note open
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
                  Pick from Explorer or hit{" "}
                  <kbd
                    style={{
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      padding: "1px 5px",
                      borderRadius: 3,
                    }}
                  >
                    ⌘K
                  </kbd>{" "}
                  to search
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {notesMeta.slice(0, 4).map((n) => (
                    <button
                      key={n.relPath}
                      onClick={() => openPath(n.relPath)}
                      style={{
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 11,
                        color: "var(--text)",
                        cursor: "pointer",
                      }}
                    >
                      {n.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : note ? (
            <div
              style={{
                flex: 1,
                overflow: "auto",
                display: "flex",
                justifyContent: "center",
                padding: "16px 0",
              }}
            >
              <div style={{ width: 720, maxWidth: "92%" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginBottom: 10,
                    fontFamily: "Fragment Mono",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{activePath.split("/").slice(0, -1).join(" / ") || "—"}</span>
                  <span style={{ opacity: 0.3 }}>/</span>
                  <b style={{ color: "var(--text)", fontWeight: 500 }}>{note.title}</b>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {note.relPath}
                  </span>
                </div>
                <h1
                  style={{
                    fontFamily: "Inter,sans-serif",
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-.01em",
                    margin: "0 0 10px",
                    lineHeight: 1.2,
                  }}
                >
                  {note.title}
                </h1>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      padding: "3px 7px",
                      borderRadius: 4,
                      color: "var(--muted)",
                    }}
                  >
                    <b style={{ color: "var(--accent)", fontWeight: 500 }}>type</b>{" "}
                    {note.type}
                  </span>
                  {note.importance !== null && (
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        background: note.importance >= 8 ? "var(--red)" : "var(--panel2)",
                        color: note.importance >= 8 ? "#fff" : "var(--muted)",
                        border: "1px solid var(--border)",
                        padding: "3px 7px",
                        borderRadius: 4,
                      }}
                    >
                      <b>imp</b> {String(note.importance)}
                    </span>
                  )}
                  {note.tags.length > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        background: "var(--panel2)",
                        border: "1px solid var(--border)",
                        padding: "3px 7px",
                        borderRadius: 4,
                        color: "var(--muted)",
                      }}
                    >
                      <b style={{ color: "var(--accent2)" }}>tags</b>{" "}
                      {note.tags.join(" ")}
                    </span>
                  )}
                  {note.epic && (
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        background: "var(--panel2)",
                        border: "1px solid var(--border)",
                        padding: "3px 7px",
                        borderRadius: 4,
                        color: "var(--muted)",
                      }}
                    >
                      <b>epic</b> {note.epic}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    overflow: "hidden",
                    boxShadow: "0 2px 12px rgba(0,0,0,.2)",
                    padding: "14px 18px",
                    fontSize: 12.5,
                    lineHeight: 1.7,
                    color: "var(--text)",
                  }}
                >
                  <Markdown
                    body={note.body}
                    workspace={activeWs}
                    currentPath={note.relPath}
                    onWikilink={handleWikilink}
                    knownTargets={knownTargets}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 6 }}>
                Not found
              </div>
              <div style={{ fontSize: 12 }}>
                {activePath} — unresolved wikilink or missing file
              </div>
              <button
                onClick={() => closeTab(activePath)}
                style={{
                  marginTop: 12,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Close tab
              </button>
            </div>
          )}
        </div>

        {/* Right dock */}
        <div
          style={{
            background: "var(--panel)",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {mode === "graph" ? (
            <>
              <div
                style={{
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                Filters
              </div>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  Graph filters
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                  Use top bar: Depth 1/2, Full vault, and type/tag/feature filters. Click
                  node → tab.
                </div>
                <div
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11,
                    color: "var(--muted)",
                  }}
                >
                  Focus: {activePath || "—"}
                  <br />
                  {graph
                    ? `${(graph.nodes ?? []).length} nodes · ${(graph.edges ?? []).length} edges`
                    : "loading"}
                </div>
              </div>
            </>
          ) : isWorklogTimeline && worklogData ? (
            <>
              <div
                style={{
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                Worklog · {worklogFocus}
              </div>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  Date jump
                </div>
                {worklogData.entries.map((e) => (
                  <div
                    key={e.relPath}
                    onClick={() => {
                      const el = document.getElementById(e.date);
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    style={{
                      padding: "7px 9px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        background: "var(--amber)",
                        borderRadius: 2,
                        display: "inline-block",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text)",
                        fontFamily: "Fragment Mono",
                      }}
                    >
                      {e.date}
                    </span>
                    <span
                      style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}
                    >
                      {e.relPath.split("/").pop()}
                    </span>
                  </div>
                ))}
                {worklogData.stateExists && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      background: "var(--bg)",
                      border: "1px dashed var(--border)",
                      borderRadius: 6,
                      padding: 8,
                      textAlign: "center",
                    }}
                  >
                    ▲ STATE.md pinned top
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  height: 32,
                  display: "flex",
                  borderBottom: "1px solid var(--border)",
                  overflowX: "auto",
                }}
              >
                {[
                  { k: "backlinks", l: `Backlinks · ${note?.backlinks.length ?? 0}` },
                  { k: "outgoing", l: `Outgoing · ${note?.outgoing.length ?? 0}` },
                  { k: "outline", l: "Outline" },
                  { k: "tags", l: "Tags" },
                ].map((t) => (
                  <div
                    key={t.k}
                    style={{
                      padding: "0 10px",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      borderBottom: "2px solid var(--accent)",
                      color: "var(--text)",
                      opacity: t.k === "backlinks" ? 1 : 0.5,
                    }}
                  >
                    {t.l}
                  </div>
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 2,
                        background: "var(--accent)",
                        display: "inline-block",
                        borderRadius: 2,
                      }}
                    />{" "}
                    Outgoing
                  </div>
                  {note?.outgoing.length ? (
                    note.outgoing.map((r, i) => (
                      <div
                        key={`${r.target}-${i}`}
                        onClick={() => handleWikilink(r.target, false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 9px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          marginBottom: 6,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            background: "var(--panel2)",
                            border: "1px solid var(--border)",
                            padding: "1px 5px",
                            borderRadius: 4,
                          }}
                        >
                          {r.relationType}
                        </span>
                        <span
                          style={{
                            color: "var(--accent)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.target}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        background: "var(--bg)",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        padding: "10px",
                        textAlign: "center",
                      }}
                    >
                      No outgoing links
                    </div>
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 2,
                        background: "var(--accent2)",
                        display: "inline-block",
                        borderRadius: 2,
                      }}
                    />{" "}
                    Backlinks
                  </div>
                  {note?.backlinks.length ? (
                    note.backlinks.map((b) => (
                      <div
                        key={b.relPath}
                        onClick={() => openPath(b.relPath)}
                        style={{
                          padding: "8px 9px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          marginBottom: 6,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text)",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              background: "var(--accent2)",
                              borderRadius: "50%",
                              display: "inline-block",
                            }}
                          />
                          {b.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginTop: 3,
                            lineHeight: 1.4,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                          dangerouslySetInnerHTML={{
                            __html: note
                              ? b.snippet.replace(
                                  new RegExp(
                                    note.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                                    "gi",
                                  ),
                                  (m) =>
                                    `<span style="color:var(--accent);background:rgba(108,92,255,.15);padding:0 2px;border-radius:2px">${m}</span>`,
                                )
                              : b.snippet,
                          }}
                        />
                        <div
                          style={{ fontSize: 10, color: "var(--faint)", marginTop: 4 }}
                        >
                          {b.relPath}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        background: "var(--bg)",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        padding: "10px",
                        textAlign: "center",
                      }}
                    >
                      No backlinks
                    </div>
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginBottom: 8,
                    }}
                  >
                    Tags
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {note && note.tags.length > 0 ? (
                      note.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: 11,
                            background: "var(--accent)",
                            color: "#fff",
                            padding: "2px 7px",
                            borderRadius: 10,
                          }}
                        >{`#${t}`}</span>
                      ))
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>
                    )}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginBottom: 8,
                    }}
                  >
                    Outline
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      lineHeight: 1.7,
                      fontFamily: "Fragment Mono",
                    }}
                  >
                    {note?.body ? (
                      note.body
                        .split("\n")
                        .filter((l) => l.startsWith("#"))
                        .slice(0, 8)
                        .map((h, i) => (
                          <div
                            key={i}
                            style={{
                              paddingLeft: (h.match(/^#+/)?.[0].length ?? 1) * 8,
                              color: i === 0 ? "var(--text)" : "var(--muted)",
                              fontWeight: i === 0 ? 600 : 400,
                            }}
                          >
                            {h.replace(/^#+\s*/, "")}
                          </div>
                        ))
                    ) : (
                      <div style={{ fontStyle: "italic" }}>No headings</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status */}
      <div
        style={{
          height: 20,
          background: "var(--accent)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 10px",
          fontSize: 11,
          fontFamily: "Fragment Mono",
          flexShrink: 0,
        }}
      >
        <span>{workspaces.find((w) => w.id === activeWs)?.noteCount ?? 0} notes</span>
        <span style={{ opacity: 0.8 }}>
          index {workspaces.find((w) => w.id === activeWs)?.indexFresh ?? "…"}
        </span>
        <span style={{ opacity: 0.8 }}>
          vault: {workspaces.find((w) => w.id === activeWs)?.tildifiedKb ?? ""}
        </span>
        <button
          onClick={handleReindex}
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,.18)",
            border: "1px solid rgba(255,255,255,.3)",
            color: "#fff",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Reindex
        </button>
        <span style={{ opacity: 0.9 }}>localhost:3415 • console • viewer only</span>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,.3)",
            zIndex: 40,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
