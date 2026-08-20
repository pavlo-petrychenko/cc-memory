import type { NoteRead } from "../api/client.ts";

export type Tab = {
  path: string;
  title: string;
  note: NoteRead | null;
  loading: boolean;
};

type Props = {
  tabs: Tab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseAll: () => void;
};

export function TabBar({ tabs, activePath, onSelect, onClose, onCloseAll }: Props) {
  if (tabs.length === 0) {
    return (
      <div
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid #2a303c",
          background: "#0f1115",
          fontSize: 12,
          color: "#5a6577",
        }}
      >
        No open notes — open from tree or graph
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "#0f1115",
        borderBottom: "1px solid #2a303c",
        overflowX: "auto",
        scrollbarWidth: "thin",
        height: 36,
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        return (
          <div
            key={tab.path}
            onClick={() => onSelect(tab.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 10px",
              borderRight: "1px solid #1e232b",
              background: isActive ? "#181b20" : "#0f1115",
              borderTop: isActive ? "2px solid #7c86ff" : "2px solid transparent",
              color: isActive ? "#e6e8ec" : "#8b95a5",
              cursor: "pointer",
              minWidth: 140,
              maxWidth: 220,
              whiteSpace: "nowrap",
              overflow: "hidden",
              fontSize: 12,
            }}
            title={tab.path}
          >
            <span style={{ fontSize: 12 }}>{tab.loading ? "⏳" : "📄"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {tab.title || tab.path}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              style={{
                marginLeft: "auto",
                background: isActive ? "#1e232b" : "transparent",
                border: "none",
                color: "#5a6577",
                cursor: "pointer",
                borderRadius: 6,
                padding: "2px 6px",
                fontSize: 11,
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
        );
      })}
      {tabs.length > 1 && (
        <button
          onClick={onCloseAll}
          style={{
            marginLeft: "auto",
            padding: "0 10px",
            background: "transparent",
            border: "none",
            color: "#5a6577",
            cursor: "pointer",
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          Close all
        </button>
      )}
    </div>
  );
}
