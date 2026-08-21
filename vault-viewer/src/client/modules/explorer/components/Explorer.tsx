import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TreeNodeDto } from "@shared/contracts/tree.contract.js";
import type { ExplorerState } from "../hooks/useExplorerState.js";
import { ExplorerRow } from "./ExplorerRow.js";

type TreeNode = TreeNodeDto;

type WorklogEntry = { date: string; body: string; relPath: string };
type WorklogSlug = {
  slug: string;
  stateExists: boolean;
  stateBody?: string;
  entries: WorklogEntry[];
};

const ExplorerContext = createContext<ExplorerState | null>(null);

function useExplorerContext(): ExplorerState {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("Explorer components must be used within Explorer.Root");
  return ctx;
}

// -- Root

type ExplorerRootProps = {
  state: ExplorerState;
  children: ReactNode;
};

export function ExplorerRoot({ state, children }: ExplorerRootProps) {
  return <ExplorerContext.Provider value={state}>{children}</ExplorerContext.Provider>;
}

// -- Group

export function ExplorerGroup({ label, accent, children }: { label: string; accent?: string; children: ReactNode }) {
  const bg = accent ?? "var(--accent)";
  return (
    <>
      <div
        className="explorer-group"
        style={{
          fontSize: 10,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          padding: label === "KB" ? "6px 8px" : "14px 8px 6px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, background: bg, borderRadius: 2, display: "inline-block" }} />
        {label}
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      {children}
    </>
  );
}

// -- Dir (recursive)

type ExplorerDirProps = {
  node: TreeNodeDto;
  depth: number;
  active: string;
  onOpen: (path: string) => void;
};

export function ExplorerDir({ node, depth, active, onOpen }: ExplorerDirProps) {
  const { expanded, toggle } = useExplorerContext();
  const isExpanded = expanded.has(node.path);
  const isActive = false;

  const children = useMemo(() => node.children ?? [], [node.children]);

  return (
    <>
      <ExplorerRow
        node={node}
        depth={depth}
        active={active}
        isExpanded={isExpanded}
        isActive={isActive}
        onOpen={onOpen}
        onToggle={toggle}
      />
      {isExpanded &&
        (children as TreeNodeDto[]).map((c) =>
          c.type === "dir" ? (
            <ExplorerDir key={c.path} node={c} depth={depth + 1} active={active} onOpen={onOpen} />
          ) : (
            <ExplorerRow
              key={c.path}
              node={c}
              depth={depth + 1}
              active={active}
              isExpanded={false}
              isActive={c.path === active}
              onOpen={onOpen}
              onToggle={toggle}
            />
          ),
        )}
    </>
  );
}

// -- File

export function ExplorerFile({
  node,
  active,
  onOpen,
}: {
  node: TreeNodeDto;
  active: string;
  onOpen: (path: string) => void;
}) {
  const { expanded, toggle } = useExplorerContext();
  return (
    <ExplorerRow
      node={node}
      depth={0}
      active={active}
      isExpanded={expanded.has(node.path)}
      isActive={node.path === active}
      onOpen={onOpen}
      onToggle={toggle}
    />
  );
}

// -- Worklog group

type ExplorerWorklogProps = {
  slug: WorklogSlug;
  active: string;
  onOpen: (path: string) => void;
  onWorklogSlug: (slug: string) => void;
};

export function ExplorerWorklog({ slug, active, onOpen, onWorklogSlug }: ExplorerWorklogProps) {
  const { expanded, toggle } = useExplorerContext();
  const key = `wl:${slug.slug}`;
  const isWorklogExpanded = expanded.has(key);

  return (
    <div>
      <div
        onClick={() => {
          if (slug.stateExists) onOpen(`${slug.slug}/STATE.md`);
          else onWorklogSlug(slug.slug);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span style={{ fontSize: 10 }}>{isWorklogExpanded ? "▾" : "▸"}</span>
        <span
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            toggle(key);
          }}
        >
          📁
        </span>
        <span style={{ color: "var(--text)" }}>{slug.slug}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            background: "var(--panel2)",
            border: "1px solid var(--border)",
            padding: "1px 4px",
            borderRadius: 10,
          }}
        >
          {slug.entries.length + (slug.stateExists ? 1 : 0)}
        </span>
      </div>
      {isWorklogExpanded && (
        <div style={{ marginLeft: 10 }}>
          {slug.stateExists && (
            <div
              onClick={() => onOpen(`${slug.slug}/STATE.md`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                background: active === `${slug.slug}/STATE.md` ? "var(--accent)" : "transparent",
                color: active === `${slug.slug}/STATE.md` ? "#fff" : "var(--muted)",
              }}
            >
              <span style={{ opacity: 0.7 }}>◆</span> STATE.md
            </div>
          )}
          {slug.entries.map((e) => (
            <div
              key={e.relPath}
              onClick={() => onOpen(e.relPath)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                background: active === e.relPath ? "var(--accent)" : "transparent",
                color: active === e.relPath ? "#fff" : "var(--muted)",
              }}
            >
              <span style={{ opacity: 0.7 }}>≡</span> {e.date}.md
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Legacy combined Explorer (backward compat, composes compound)

type LegacyExplorerProps = {
  kbTree: TreeNodeDto | null;
  worklogs: WorklogSlug[];
  active: string;
  onOpen: (path: string) => void;
  onWorklogSlug: (slug: string) => void;
  state: ExplorerState;
};

export function Explorer({ kbTree, worklogs, active, onOpen, onWorklogSlug, state }: LegacyExplorerProps) {
  return (
    <ExplorerRoot state={state}>
      <div style={{ padding: "8px 6px", overflow: "auto", flex: 1 }}>
        <ExplorerGroup label="KB">
          {kbTree?.children?.length ? (
            (kbTree.children as TreeNodeDto[]).map((c) =>
              c.type === "dir" ? (
                <ExplorerDir key={c.path} node={c} depth={0} active={active} onOpen={onOpen} />
              ) : (
                <ExplorerFile key={c.path} node={c} active={active} onOpen={onOpen} />
              ),
            )
          ) : (
            <div style={{ padding: "8px", color: "var(--muted)", fontSize: 12 }}>No notes</div>
          )}
        </ExplorerGroup>

        <ExplorerGroup label="WORKLOGS" accent="var(--accent2)">
          {worklogs.length === 0 ? (
            <div style={{ padding: "8px", color: "var(--muted)", fontSize: 12 }}>No worklogs</div>
          ) : (
            worklogs.map((s) => (
              <ExplorerWorklog key={s.slug} slug={s} active={active} onOpen={onOpen} onWorklogSlug={onWorklogSlug} />
            ))
          )}
        </ExplorerGroup>
      </div>
    </ExplorerRoot>
  );
}

// Compound export (new API)
export const ExplorerCompound = {
  Root: ExplorerRoot,
  Group: ExplorerGroup,
  Dir: ExplorerDir,
  File: ExplorerFile,
  Worklog: ExplorerWorklog,
};
