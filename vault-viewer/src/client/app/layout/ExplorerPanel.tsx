import type { TreeNodeDto, WorklogSlugDto } from "@shared/contracts/tree.contract.js";

import { Explorer } from "../../modules/explorer/components/Explorer.js";
import type { useExplorerState } from "../../modules/explorer/hooks/useExplorerState.js";

type ExplorerState = ReturnType<typeof useExplorerState>;

type Props = {
  kbTree: TreeNodeDto | null;
  worklogs: readonly WorklogSlugDto[];
  activePath: string;
  noteCount: number;
  explorerState: ExplorerState;
  onOpen: (path: string, newTab?: boolean) => void;
  onWorklogSlug: (slug: string) => void;
};

/** Left column: KB tree + worklog trees. */
export function ExplorerPanel({
  kbTree,
  worklogs,
  activePath,
  noteCount,
  explorerState,
  onOpen,
  onWorklogSlug,
}: Props) {
  return (
    <div className="side-panel">
      <div className="panel-header">
        <span className="brand-dot" /> Explorer
        <span className="note-count-chip spacer">{noteCount}</span>
      </div>
      <Explorer
        kbTree={kbTree}
        worklogs={worklogs}
        active={activePath}
        onOpen={onOpen}
        onWorklogSlug={onWorklogSlug}
        state={explorerState}
      />
    </div>
  );
}
