import type { WorklogEntryDto } from "@shared/contracts/worklog.contract.js";
import { memo } from "react";

import { Markdown } from "../../markdown/components/Markdown.js";

type Props = {
  entry: WorklogEntryDto;
  workspace: string;
  onWikilink?: (target: string, newTab: boolean) => void;
  knownTargets?: ReadonlySet<string>;
};

/** One dated journal entry; `id` is the scroll target the DateJumpRail uses. */
export const WorklogEntryCard = memo(function WorklogEntryCard({
  entry,
  workspace,
  onWikilink,
  knownTargets,
}: Props) {
  return (
    <div id={entry.date} className="entry-card">
      <div className="entry-head">
        <span className="date-badge">{entry.date}</span>
        <span className="date-rule" />
        <span className="entry-path">{entry.relPath}</span>
      </div>
      <div className="entry-body">
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
