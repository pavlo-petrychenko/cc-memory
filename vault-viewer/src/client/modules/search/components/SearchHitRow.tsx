import { memo } from "react";
import type { SearchHitDto } from "@shared/contracts/search.contract.js";

type Props = {
  hit: SearchHitDto;
  onClick: (relPath: string) => void;
};

export const SearchHitRow = memo(function SearchHitRow({ hit, onClick }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(hit.relPath)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick(hit.relPath);
      }}
      className="search-hit-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        cursor: "pointer",
        border: "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--panel2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
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
        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{hit.title}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hit.snippet} <span style={{ opacity: 0.6 }}>— {hit.relPath}</span>
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
        {hit.type}
      </span>
    </div>
  );
});
