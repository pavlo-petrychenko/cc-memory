import type { WorklogResponseDto } from "@shared/contracts/worklog.contract.js";
import { Markdown } from "../../markdown/components/Markdown.js";
import { WorklogEntryCard } from "./WorklogEntryCard.js";

type WorklogOption = {
  slug: string;
};

type Props = {
  worklog: WorklogResponseDto;
  activePath: string;
  worklogs: WorklogOption[];
  worklogFocus: string;
  onWorklogFocusChange: (slug: string) => void;
  workspace: string;
  onWikilink?: (target: string, newTab: boolean) => void;
  knownTargets?: Set<string>;
};

export function WorklogTimeline({
  worklog,
  activePath,
  worklogs,
  worklogFocus,
  onWorklogFocusChange,
  workspace,
  onWikilink,
  knownTargets,
}: Props) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 0", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 720, maxWidth: "92%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <select
            value={worklogFocus}
            onChange={(e) => onWorklogFocusChange(e.target.value)}
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
            {worklog.entries.length} entries
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>{activePath}</span>
        </div>

        {worklog.stateExists && (
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
                style={{ width: 6, height: 6, background: "var(--amber)", borderRadius: 2, display: "inline-block" }}
              />
              STATE.md — pinned
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
              <Markdown
                body={worklog.stateBody ?? ""}
                workspace={workspace}
                currentPath={`${worklogFocus}/STATE.md`}
                onWikilink={onWikilink}
                knownTargets={knownTargets}
              />
            </div>
          </div>
        )}

        {worklog.entries.map((e) => (
          <WorklogEntryCard
            key={e.relPath}
            entry={e}
            workspace={workspace}
            onWikilink={onWikilink}
            knownTargets={knownTargets}
          />
        ))}
      </div>
    </div>
  );
}
