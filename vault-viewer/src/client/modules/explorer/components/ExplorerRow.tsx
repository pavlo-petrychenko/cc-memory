import type { TreeNodeDto } from "@shared/contracts/tree.contract.js";
import { memo } from "react";
type TreeNode = TreeNodeDto;

type ExplorerRowProps = {
  node: TreeNodeDto;
  depth: number;
  active: string;
  isExpanded: boolean;
  isActive: boolean;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
};

function ExplorerRowComponent({
  node,
  depth,
  isExpanded,
  isActive,
  onOpen,
  onToggle,
}: ExplorerRowProps) {
  const isDir = node.type === "dir";

  return (
    <div
      onClick={() => (isDir ? onToggle(node.path) : onOpen(node.path))}
      className="explorer-row"
      data-active={isActive ? "true" : "false"}
      data-type={node.type}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        marginLeft: depth * 10,
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        background: isActive ? "var(--accent)" : "transparent",
        color: isActive ? "#fff" : "var(--muted)",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      <span style={{ fontSize: 10, width: 10 }}>
        {isDir ? (isExpanded ? "▾" : "▸") : "≡"}
      </span>
      <span style={{ opacity: 0.7, fontSize: 11 }}>
        {isDir ? "📁" : node.isIndex ? "★" : "≡"}
      </span>
      <span
        style={{
          fontWeight: node.isIndex ? 600 : 400,
          color: isActive ? "#fff" : "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {node.name || "/"}
      </span>
    </div>
  );
}

export const ExplorerRow = memo(ExplorerRowComponent);
