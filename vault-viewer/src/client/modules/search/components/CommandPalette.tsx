import { useEffect } from "react";
import type { SearchHitDto } from "@shared/contracts/search.contract.js";
import { SearchHitRow } from "./SearchHitRow.js";

type Filters = {
  typeFilter: string;
  tagFilter: string;
  featureFilter: string;
  setTypeFilter: (v: string) => void;
  setTagFilter: (v: string) => void;
  setFeatureFilter: (v: string) => void;
  clear: () => void;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  q: string;
  setQ: (v: string) => void;
  filters: Filters;
  hits: SearchHitDto[];
  onOpen: (relPath: string) => void;
};

export function CommandPalette({ isOpen, onClose, q, setQ, filters, hits, onOpen }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasFilters = Boolean(filters.typeFilter || filters.tagFilter || filters.featureFilter);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 30,
        display: "grid",
        placeItems: "start center",
        paddingTop: 80,
      }}
      onClick={onClose}
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
            onClick={onClose}
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
            value={filters.typeFilter}
            onChange={(e) => filters.setTypeFilter(e.target.value)}
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
            value={filters.tagFilter}
            onChange={(e) => filters.setTagFilter(e.target.value)}
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
            value={filters.featureFilter}
            onChange={(e) => filters.setFeatureFilter(e.target.value)}
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
          {hasFilters && (
            <button
              onClick={filters.clear}
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
            <SearchHitRow key={h.relPath} hit={h} onClick={onOpen} />
          ))}
          {hits.length === 0 && q.trim().length > 0 && (
            <div style={{ padding: "20px 14px", color: "var(--muted)", textAlign: "center", fontSize: 12 }}>
              No hits — try different terms or filters
            </div>
          )}
          {!q.trim() && (
            <div style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 11 }}>
              Tips:{" "}
              <code style={{ background: "var(--panel2)", padding: "1px 4px", borderRadius: 3 }}>tag:jwt</code>{" "}
              <code style={{ background: "var(--panel2)", padding: "1px 4px", borderRadius: 3 }}>type:spec</code> · Press
              Enter to open top hit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
