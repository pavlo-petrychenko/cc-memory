import type { WorklogResponseDto } from "@shared/contracts/worklog.contract.js";

import { Markdown } from "../../markdown/components/Markdown.js";
import { WorklogEntryCard } from "./WorklogEntryCard.js";

type WorklogOption = {
  slug: string;
};

type Props = {
  worklog: WorklogResponseDto;
  activePath: string;
  worklogs: readonly WorklogOption[];
  worklogFocus: string;
  onWorklogFocusChange: (slug: string) => void;
  workspace: string;
  onWikilink?: (target: string, newTab: boolean) => void;
  knownTargets?: ReadonlySet<string>;
};

/** The main-column view for one worklog tree: slug picker, pinned STATE.md,
 * then every dated entry. */
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
    <div className="content-scroll">
      <div className="reading-col">
        <div className="worklog-toolbar">
          <select
            className="select"
            value={worklogFocus}
            onChange={(e) => onWorklogFocusChange(e.target.value)}
          >
            {worklogs.map((w) => (
              <option key={w.slug} value={w.slug}>
                ▾ {w.slug}
              </option>
            ))}
          </select>
          <span className="worklog-count">{worklog.entries.length} entries</span>
          <span className="worklog-path">{activePath}</span>
        </div>

        {worklog.stateExists && (
          <div className="state-callout">
            <div className="label">
              <span className="state-dot" /> STATE.md — pinned
            </div>
            <div className="entry-body">
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
