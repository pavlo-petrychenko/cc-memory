import { useEffect, useState } from "react";

import { api } from "../api/client.ts";

type Props = {
  workspaceId: string;
  onOpenNote: (path: string) => void;
};

type SearchBreakdown = {
  query: string;
  tokens: string[];
  orderedTerms: string[];
  ftsQuery: string;
  phraseQuery: string;
  hits: { path: string; title: string; snippet: string; score: number }[];
  config: { linkBoost: number; injectMinScore: number };
};

type InjectBreakdown = {
  prompt: string;
  cwd: string | null;
  tokens: string[];
  orderedTerms: string[];
  ftsQuery: string;
  phraseQuery: string;
  gate: {
    promptLength: number;
    minPromptLength: number;
    salientTokens: number;
    minSalientTokens: number;
    injectMinScore: number;
    linkBoost: number;
    maxInjectedNotes: number;
    maxInjectedWorklogs: number;
    gated: boolean;
  };
  notePool: { path: string; title: string; snippet: string; score: number }[];
  worklogPool: { path: string; title: string; snippet: string; score: number }[];
  injected: {
    notes: { path: string; title: string; snippet: string; score: number }[];
    worklogs: { path: string; title: string; snippet: string; score: number }[];
  };
};

type Tool = "search" | "notes" | "resolve" | "inject" | "session";

const TOOL_META: Record<Tool, { icon: string; label: string; desc: string }> = {
  search: {
    icon: "🔍",
    label: "Search",
    desc: "BM25 + RRF + link boost — see tokens → FTS → hits",
  },
  notes: { icon: "📄", label: "Notes", desc: "Enumerate vault notes, filter by folder" },
  resolve: {
    icon: "🧭",
    label: "Resolve",
    desc: "cwd → workspace (longest-prefix match)",
  },
  inject: {
    icon: "💉",
    label: "Memory • Inject",
    desc: "UserPromptSubmit hook — prompt → injected markdown",
  },
  session: {
    icon: "🚀",
    label: "SessionStart",
    desc: "Reindex + KB map + STATE.md injection",
  },
};

export function Playground({ workspaceId, onOpenNote }: Props) {
  const [active, setActive] = useState<Tool>(() => {
    try {
      const v = localStorage.getItem("cc-memory:playground:tool") as Tool | null;
      return v && TOOL_META[v as Tool] ? (v as Tool) : "inject";
    } catch {
      return "inject";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:playground:tool", active);
    } catch {
      // ignore
    }
  }, [active]);

  // Shared workspace display
  const wsLabel = workspaceId || "(no workspace)";

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, background: "#0f1115" }}>
      <nav
        style={{
          width: 200,
          borderRight: "1px solid #1e232b",
          background: "#0d0f13",
          display: "flex",
          flexDirection: "column",
          padding: 10,
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#5a6577",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "4px 6px",
          }}
        >
          Playground — {wsLabel}
        </div>
        {(Object.keys(TOOL_META) as Tool[]).map((key) => {
          const meta = TOOL_META[key];
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: isActive ? "1px solid #2a303c" : "1px solid transparent",
                background: isActive ? "#181b20" : "transparent",
                color: isActive ? "#e6e8ec" : "#8b95a5",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 12,
              }}
            >
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{meta.label}</div>
                <div style={{ fontSize: 10, color: "#5a6577", lineHeight: 1.2 }}>
                  {meta.desc}
                </div>
              </span>
            </button>
          );
        })}
        <div
          style={{
            marginTop: "auto",
            padding: "10px 6px",
            fontSize: 10,
            color: "#3a4455",
            lineHeight: 1.5,
          }}
        >
          Tip: paste a real prompt from Claude Code — see exactly what the hook would
          inject. All calls hit the live vault & index.
        </div>
      </nav>

      <div style={{ flex: 1, minWidth: 0, overflow: "auto", background: "#181b20" }}>
        {active === "search" && (
          <SearchLab workspaceId={workspaceId} onOpenNote={onOpenNote} />
        )}
        {active === "notes" && (
          <NotesLab workspaceId={workspaceId} onOpenNote={onOpenNote} />
        )}
        {active === "resolve" && <ResolveLab workspaceId={workspaceId} />}
        {active === "inject" && (
          <InjectLab workspaceId={workspaceId} onOpenNote={onOpenNote} />
        )}
        {active === "session" && <SessionLab workspaceId={workspaceId} />}
      </div>
    </div>
  );
}

function Card({
  children,
  title,
  icon,
  right,
}: {
  children: React.ReactNode;
  title: string;
  icon?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#0f1115",
        border: "1px solid #2a303c",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #1e232b",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          color: "#c9d1de",
        }}
      >
        {icon && <span>{icon}</span>} {title}
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore
    }
  };
  return (
    <div
      style={{
        position: "relative",
        background: "#0d0f13",
        border: "1px solid #1e232b",
        borderRadius: 8,
        padding: 10,
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "#c9d1de",
      }}
    >
      {label && (
        <div style={{ fontSize: 10, color: "#5a6577", marginBottom: 6 }}>{label}</div>
      )}
      {code || <span style={{ color: "#3a4455" }}>(empty)</span>}
      <button
        onClick={copy}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          fontSize: 10,
          padding: "2px 6px",
          borderRadius: 6,
          border: "1px solid #2a303c",
          background: "#181b20",
          color: "#8b95a5",
          cursor: "pointer",
        }}
      >
        copy
      </button>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const strength = -score;
  const color =
    strength >= 2
      ? "#3dd68c"
      : strength >= 0.7
        ? "#fcc419"
        : strength >= 0.2
          ? "#8b95a5"
          : "#5a6577";
  return (
    <span
      style={{
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 999,
        background: "#0f1115",
        border: `1px solid ${color}40`,
        color,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {score.toFixed(3)}
    </span>
  );
}

// ---- Search Lab ----
function SearchLab({
  workspaceId,
  onOpenNote,
}: {
  workspaceId: string;
  onOpenNote: (p: string) => void;
}) {
  const [query, setQuery] = useState(() => {
    try {
      return (
        localStorage.getItem("cc-memory:playground:search:query") ??
        "overall_score prompt_version"
      );
    } catch {
      return "overall_score prompt_version";
    }
  });
  const [limit, setLimit] = useState(8);
  const [worklog, setWorklog] = useState(false);
  const [data, setData] = useState<SearchBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:playground:search:query", query);
    } catch {}
  }, [query]);

  const run = async () => {
    if (!workspaceId || !query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/playground/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, query, limit, worklog }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = (await res.json()) as SearchBreakdown;
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <Card
        title="Search playground"
        icon="🔍"
        right={
          <span style={{ fontSize: 11, color: "#5a6577" }}>
            {workspaceId} • limit {limit}
          </span>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="Try: overall_score, salesQa module (API), Langfuse prompt"
              style={{
                flex: 1,
                background: "#0d0f13",
                border: "1px solid #2a303c",
                borderRadius: 8,
                padding: "8px 10px",
                color: "#e6e8ec",
                fontSize: 12,
              }}
            />
            <button
              onClick={() => void run()}
              disabled={loading}
              style={{
                background: "#7c86ff",
                color: "#0f1115",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 700,
                fontSize: 12,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "…" : "Run"}
            </button>
          </div>
          <div
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 11,
                color: "#8b95a5",
              }}
            >
              <input
                type="range"
                min={1}
                max={20}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                style={{ accentColor: "#7c86ff" }}
              />{" "}
              k={limit}
            </label>
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 11,
                color: "#8b95a5",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={worklog}
                onChange={(e) => setWorklog(e.target.checked)}
                style={{ accentColor: "#7c86ff" }}
              />{" "}
              worklogs
            </label>
            <span style={{ fontSize: 10, color: "#3a4455" }}>
              Tip: exact identifiers (overall_score, prompt_version) beat prose
            </span>
          </div>
        </div>
      </Card>

      {error && (
        <div
          style={{
            background: "#3a1a1a",
            border: "1px solid #5a2a2a",
            color: "#ff9e9e",
            padding: 10,
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card title="Tokens" icon="▫">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.tokens.length === 0 ? (
                  <span style={{ fontSize: 11, color: "#5a6577" }}>
                    (no salient tokens — try longer query)
                  </span>
                ) : (
                  data.tokens.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: "#1e232b",
                        border: "1px solid #2a303c",
                        color: "#c9d1de",
                      }}
                    >
                      {t}
                    </span>
                  ))
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#5a6577" }}>
                ordered: {data.orderedTerms.join(" → ") || "—"}
              </div>
            </Card>
            <Card title="FTS query" icon="⌘">
              <CodeBlock
                code={data.ftsQuery || "(empty — try 2+ tokens)"}
                label="token-OR"
              />
              <div style={{ marginTop: 8 }}>
                <CodeBlock
                  code={data.phraseQuery || "(no adjacent pair → no NEAR)"}
                  label="phrase/NEAR — phrase_query()"
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#5a6577" }}>
                linkBoost {data.config.linkBoost} · injectMinScore{" "}
                {data.config.injectMinScore}
              </div>
            </Card>
          </div>

          <Card
            title={`Hits — ${data.hits.length} / ${limit}`}
            icon="🎯"
            right={
              <span style={{ fontSize: 10, color: "#5a6577" }}>
                BM25 + Porter + RRF k=60 + wikilink corroboration
              </span>
            }
          >
            {data.hits.length === 0 ? (
              <div style={{ fontSize: 12, color: "#5a6577" }}>
                No hits — try a less specific query or lower the floor in code.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.hits.map((hit) => (
                  <button
                    key={hit.path}
                    onClick={() => onOpenNote(hit.path)}
                    style={{
                      textAlign: "left",
                      background: "#0d0f13",
                      border: "1px solid #1e232b",
                      borderRadius: 10,
                      padding: 10,
                      cursor: "pointer",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#e6e8ec" }}>
                        {hit.title}
                      </span>
                      <ScorePill score={hit.score} />
                      <span
                        style={{ marginLeft: "auto", fontSize: 10, color: "#5a6577" }}
                      >
                        {hit.path}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#8b95a5", lineHeight: 1.5 }}>
                      {hit.snippet}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function NotesLab({
  workspaceId,
  onOpenNote,
}: {
  workspaceId: string;
  onOpenNote: (p: string) => void;
}) {
  const [folder, setFolder] = useState("");
  const [notes, setNotes] = useState<{ path: string; title: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/kb/notes${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { path: string; title: string; type: string }[];
      setNotes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <Card title="Notes — enumerate vault" icon="📄">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Folder filter — e.g. Langfuse, AI SDR, Infrastructure (Terraform)"
            style={{
              flex: 1,
              background: "#0d0f13",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#e6e8ec",
              fontSize: 12,
            }}
          />
          <button
            onClick={() => void run()}
            style={{
              background: "#7c86ff",
              color: "#0f1115",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            List
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#5a6577" }}>
          {loading
            ? "Loading…"
            : `${notes.length} notes${folder ? ` in ${folder}` : ""} — click to open in a new tab`}
        </div>
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gap: 6,
            maxHeight: 520,
            overflow: "auto",
          }}
        >
          {notes.map((n) => (
            <button
              key={n.path}
              onClick={() => onOpenNote(n.path)}
              style={{
                textAlign: "left",
                background: "#0d0f13",
                border: "1px solid #1e232b",
                borderRadius: 8,
                padding: "8px 10px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "#e6e8ec",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {n.title}
              </span>
              <span style={{ fontSize: 10, color: "#5a6577", flexShrink: 0 }}>
                {n.path}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ResolveLab({ workspaceId }: { workspaceId: string }) {
  const [cwd, setCwd] = useState(() => {
    try {
      return localStorage.getItem("cc-memory:playground:cwd") ?? "";
    } catch {
      return "";
    }
  });
  const [out, setOut] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:playground:cwd", cwd);
    } catch {}
  }, [cwd]);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/playground/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: cwd || undefined }),
      });
      const j = await res.json();
      setOut(j);
    } catch (e) {
      setOut(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <Card title="Resolve — cwd → workspace" icon="🧭">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="Leave empty for current cwd, or try /Users/…/Documents/personal/cc-memory"
            style={{
              flex: 1,
              background: "#0d0f13",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#e6e8ec",
              fontSize: 12,
            }}
          />
          <button
            onClick={() => void run()}
            style={{
              background: "#7c86ff",
              color: "#0f1115",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Resolve
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#5a6577" }}>
          Longest-prefix match against <code>~/.claude/memory/registry.toml</code>. No
          match → no memory at all — the isolation boundary.
        </div>
      </Card>
      <Card title="Result" icon="📋">
        {loading ? (
          <div style={{ fontSize: 12, color: "#8b95a5" }}>Resolving…</div>
        ) : out ? (
          <CodeBlock code={JSON.stringify(out, null, 2)} />
        ) : (
          <div style={{ fontSize: 12, color: "#5a6577" }}>
            Run to see which workspace a cwd maps to.
          </div>
        )}
      </Card>
    </div>
  );
}

function InjectLab({
  workspaceId,
  onOpenNote,
}: {
  workspaceId: string;
  onOpenNote: (p: string) => void;
}) {
  const [prompt, setPrompt] = useState(() => {
    try {
      return (
        localStorage.getItem("cc-memory:playground:prompt") ??
        "How does salesQa scoring use Langfuse prompts and where is overall_score stored?"
      );
    } catch {
      return "How does salesQa scoring use Langfuse prompts and where is overall_score stored?";
    }
  });
  const [data, setData] = useState<InjectBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:playground:prompt", prompt);
    } catch {}
  }, [prompt]);

  const run = async () => {
    if (!workspaceId || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/playground/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, prompt }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const j = (await res.json()) as InjectBreakdown;
      setData(j);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gated = data?.gate.gated ?? false;

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <Card
        title="Memory • Inject — UserPromptSubmit"
        icon="💉"
        right={<span style={{ fontSize: 11, color: "#5a6577" }}>{workspaceId}</span>}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste a real Claude Code prompt — e.g. 'fix the salesQa overall_score drift' or 'same for the worker'"
            rows={3}
            style={{
              background: "#0d0f13",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: 10,
              color: "#e6e8ec",
              fontSize: 12,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => void run()}
              disabled={loading}
              style={{
                background: "#7c86ff",
                color: "#0f1115",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 700,
                fontSize: 12,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Running…" : "Simulate inject"}
            </button>
            <span style={{ fontSize: 11, color: "#5a6577" }}>
              Hot path ≈ 50–100ms · gated on length & tokens
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#3a4455" }}>
              {prompt.trim().length} chars
            </span>
          </div>
        </div>
      </Card>

      {error && (
        <div
          style={{
            background: "#3a1a1a",
            border: "1px solid #5a2a2a",
            color: "#ff9e9e",
            padding: 10,
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card title="Tokens" icon="▫">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.tokens.length === 0 ? (
                  <span style={{ fontSize: 11, color: "#5a6577" }}>
                    (no salient tokens)
                  </span>
                ) : (
                  data.tokens.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: "#1e232b",
                        border: "1px solid #2a303c",
                        color: "#c9d1de",
                      }}
                    >
                      {t}
                    </span>
                  ))
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#5a6577" }}>
                ordered: {data.orderedTerms.join(" → ") || "—"}
              </div>
            </Card>
            <Card title="Gate" icon={gated ? "⛔" : "✅"}>
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: gated ? "#ff9e9e" : "#3dd68c",
                }}
              >
                {gated ? (
                  <>
                    <div>
                      ⛔ <strong>Gated — would inject nothing</strong>
                    </div>
                    <div style={{ color: "#8b95a5", marginTop: 4 }}>
                      {data.gate.promptLength < data.gate.minPromptLength && (
                        <div>
                          prompt length {data.gate.promptLength} &lt;{" "}
                          {data.gate.minPromptLength}
                        </div>
                      )}
                      {data.gate.salientTokens < data.gate.minSalientTokens && (
                        <div>
                          salient tokens {data.gate.salientTokens} &lt;{" "}
                          {data.gate.minSalientTokens}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>✅ Passed — would inject top hits (if any clear the floor)</div>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#5a6577" }}>
                floor {data.gate.injectMinScore} · linkBoost {data.gate.linkBoost} · max{" "}
                {data.gate.maxInjectedNotes} notes + {data.gate.maxInjectedWorklogs}{" "}
                worklog
              </div>
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card title="FTS query" icon="⌘">
              <CodeBlock code={data.ftsQuery || "(empty)"} label="token-OR" />
              <div style={{ marginTop: 8 }}>
                <CodeBlock
                  code={data.phraseQuery || "(no adjacent pair)"}
                  label="phrase/NEAR"
                />
              </div>
            </Card>
            <Card title="Candidates (8-pool)" icon="📦">
              <div style={{ fontSize: 11, color: "#8b95a5", marginBottom: 8 }}>
                {data.notePool.length} note candidates · {data.worklogPool.length} worklog
                candidates
              </div>
              <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
                {data.notePool.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#5a6577" }}>(no candidates)</div>
                ) : (
                  data.notePool.map((hit) => {
                    const passed = -hit.score >= data.gate.injectMinScore;
                    return (
                      <div
                        key={hit.path}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: passed ? "1px solid #1e3a2a" : "1px solid #2a303c",
                          background: passed ? "#0f1a15" : "#0d0f13",
                          opacity: passed ? 1 : 0.55,
                        }}
                      >
                        <ScorePill score={hit.score} />
                        <span
                          style={{
                            fontSize: 11,
                            color: "#c9d1de",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {hit.title}
                        </span>
                        <span
                          style={{ marginLeft: "auto", fontSize: 10, color: "#5a6577" }}
                        >
                          {passed ? "✓ inject" : "× floored"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <Card
            title={`Injected — ${data.injected.notes.length} notes + ${data.injected.worklogs.length} worklog`}
            icon="💊"
            right={
              <span style={{ fontSize: 10, color: "#5a6577" }}>
                what Claude Code would see
              </span>
            }
          >
            {data.injected.notes.length === 0 && data.injected.worklogs.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "#5a6577",
                  padding: 8,
                  textAlign: "center",
                }}
              >
                Nothing injected — below floor or gated. Try a more specific prompt with
                identifiers.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {data.injected.notes.map((hit) => (
                  <button
                    key={hit.path}
                    onClick={() => onOpenNote(hit.path)}
                    style={{
                      textAlign: "left",
                      background: "#0d0f13",
                      border: "1px solid #1e232b",
                      borderRadius: 10,
                      padding: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#e6e8ec" }}>
                        {hit.title}
                      </span>
                      <ScorePill score={hit.score} />
                      <span
                        style={{ marginLeft: "auto", fontSize: 10, color: "#5a6577" }}
                      >
                        {hit.path}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#8b95a5",
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {hit.snippet}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: "#7c86ff" }}>
                      open →
                    </div>
                  </button>
                ))}
                {data.injected.worklogs.map((hit) => (
                  <div
                    key={hit.path}
                    style={{
                      background: "#0d0f13",
                      border: "1px solid #1e232b",
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#5a6577" }}>
                      worklog · {hit.path}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b95a5", marginTop: 4 }}>
                      {hit.snippet}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SessionLab({ workspaceId }: { workspaceId: string }) {
  const [cwd, setCwd] = useState(() => {
    try {
      return localStorage.getItem("cc-memory:playground:sessionCwd") ?? "";
    } catch {
      return "";
    }
  });
  const [out, setOut] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("cc-memory:playground:sessionCwd", cwd);
    } catch {}
  }, [cwd]);

  const run = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/playground/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, cwd: cwd || undefined }),
      });
      const j = await res.json();
      setOut(j);
    } catch (e) {
      setOut(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <Card title="SessionStart — incremental reindex + KB map" icon="🚀">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="cwd — leave empty for current, or try /Users/…/Documents/personal/cc-memory"
            style={{
              flex: 1,
              background: "#0d0f13",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#e6e8ec",
              fontSize: 12,
            }}
          />
          <button
            onClick={() => void run()}
            style={{
              background: "#7c86ff",
              color: "#0f1115",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Simulate
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#5a6577" }}>
          Runs incremental reindex (mtime) then renders the exact markdown injected at
          SessionStart.
        </div>
      </Card>
      <Card title="Result" icon="📋">
        {loading ? (
          <div style={{ fontSize: 12, color: "#8b95a5" }}>Running…</div>
        ) : out ? (
          <CodeBlock
            code={typeof out === "string" ? out : JSON.stringify(out, null, 2)}
          />
        ) : (
          <div style={{ fontSize: 12, color: "#5a6577" }}>
            Run to see SessionStart output.
          </div>
        )}
      </Card>
    </div>
  );
}
