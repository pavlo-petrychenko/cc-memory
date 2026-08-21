import type { SearchHitDto } from "@shared/contracts/search.contract.js";
import { memo } from "react";

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
      className="hit-row"
    >
      <span className="hit-icon">≡</span>
      <div className="hit-main">
        <div className="hit-title">{hit.title}</div>
        <div className="hit-snippet">
          {hit.snippet} <span className="rel">— {hit.relPath}</span>
        </div>
      </div>
      <span className="hit-type">{hit.type}</span>
    </div>
  );
});
