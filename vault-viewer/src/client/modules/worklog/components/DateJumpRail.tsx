import type { WorklogEntryDto } from "@shared/contracts/worklog.contract.js";
import { memo } from "react";

type Props = {
  entries: readonly WorklogEntryDto[];
  onJump: (date: string) => void;
};

/** Right-dock date index; jumping scrolls to the entry card with that id. */
export const DateJumpRail = memo(function DateJumpRail({ entries, onJump }: Props) {
  return (
    <>
      <div className="section-label">Date jump</div>
      {entries.map((e) => (
        <div
          key={e.relPath}
          role="button"
          tabIndex={0}
          className="jump-row"
          onClick={() => onJump(e.date)}
          onKeyDown={(ke) => {
            if (ke.key === "Enter") onJump(e.date);
          }}
        >
          <span className="jump-dot" />
          <span className="jump-date">{e.date}</span>
          <span className="jump-file">{e.relPath.split("/").pop()}</span>
        </div>
      ))}
    </>
  );
});
