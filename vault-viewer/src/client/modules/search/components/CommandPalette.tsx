import type { SearchHitDto } from "@shared/contracts/search.contract.js";
import { useEffect } from "react";

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
  hits: readonly SearchHitDto[];
  onOpen: (relPath: string) => void;
};

/** ⌘K palette: query input, type/tag/feature filters, ranked hits. */
export function CommandPalette({
  isOpen,
  onClose,
  q,
  setQ,
  filters,
  hits,
  onOpen,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasFilters = Boolean(
    filters.typeFilter || filters.tagFilter || filters.featureFilter,
  );

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="palette-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="palette-inputrow">
          <span style={{ color: "var(--muted)" }}>⌕</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…  type:spec tag:auth"
          />
          <button type="button" className="btn btn-subtle" onClick={onClose}>
            ESC
          </button>
        </div>

        <div className="palette-filterrow">
          <span className="filters-label">Filters</span>
          <input
            className="input"
            value={filters.typeFilter}
            onChange={(e) => filters.setTypeFilter(e.target.value)}
            placeholder="type:spec"
          />
          <input
            className="input"
            value={filters.tagFilter}
            onChange={(e) => filters.setTagFilter(e.target.value)}
            placeholder="tag:auth"
          />
          <input
            className="input"
            style={{ width: 110 }}
            value={filters.featureFilter}
            onChange={(e) => filters.setFeatureFilter(e.target.value)}
            placeholder="feature:auth"
          />
          {hasFilters && (
            <button type="button" className="clear-filters" onClick={filters.clear}>
              Clear
            </button>
          )}
        </div>

        <div className="palette-results">
          <div className="results-label">Results · {hits.length}</div>
          {hits.map((h) => (
            <SearchHitRow key={h.relPath} hit={h} onClick={onOpen} />
          ))}
          {hits.length === 0 && q.trim().length > 0 && (
            <div className="no-hits">No hits — try different terms or filters</div>
          )}
          {!q.trim() && !hasFilters && (
            <div className="palette-tips">
              Tips: <code>tag:jwt</code> <code>type:spec</code> · Press Enter to open top
              hit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
