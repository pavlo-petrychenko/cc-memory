import type { WorklogEntryDto } from "@shared/contracts/worklog.contract.js";
import { memo } from "react";

import { Markdown } from "../../markdown/components/Markdown.js";

type Props = {
  entry: WorklogEntryDto;
  workspace: string;
  onWikilink?: (target: string, newTab: boolean) => void;
  knownTargets?: Set<string>;
};

export const WorklogEntryCard = memo(function WorklogEntryCard({
  entry,
  workspace,
  onWikilink,
  knownTargets,
}: Props) {
  return (
    <div
      id={entry.date}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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
          {entry.date}
        </span>
        <span style={{ width: 24, height: 1, background: "var(--border)" }} />
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{entry.relPath}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
        <Markdown
          body={entry.body}
          workspace={workspace}
          currentPath={entry.relPath}
          onWikilink={onWikilink}
          knownTargets={knownTargets}
        />
      </div>
    </div>
  );
});
