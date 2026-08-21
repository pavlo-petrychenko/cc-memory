import type { WorklogEntryDto } from "@shared/contracts/worklog.contract.js";
import { memo } from "react";

type Props = {
  entries: WorklogEntryDto[];
  onJump: (date: string) => void;
};

export const DateJumpRail = memo(function DateJumpRail({ entries, onJump }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
      {entries.map((e) => (
        <div
          key={e.relPath}
          role="button"
          tabIndex={0}
          onClick={() => onJump(e.date)}
          onKeyDown={(ke) => {
            if (ke.key === "Enter") onJump(e.date);
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
            style={{ fontSize: 12, color: "var(--text)", fontFamily: "Fragment Mono" }}
          >
            {e.date}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>
            {e.relPath.split("/").pop()}
          </span>
        </div>
      ))}
    </div>
  );
});
