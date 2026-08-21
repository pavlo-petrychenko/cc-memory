import { useTabs } from "../providers/tabs.provider.js";

/** Horizontal strip of open notes. Active-tab chrome lives in CSS (`.tab`). */
export function TabStrip() {
  const { tabs, activePath, setActivePath, closeTab } = useTabs();

  if (tabs.length === 0) {
    return (
      <div className="tabbar">
        <div className="tabbar-empty">No open notes — pick from Explorer or ⌘K</div>
      </div>
    );
  }

  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.relPath}
          className={`tab${t.relPath === activePath ? " active" : ""}`}
          onClick={() => setActivePath(t.relPath)}
        >
          <span className="tab-glyph">{t.relPath.includes("STATE") ? "◆" : "≡"}</span>
          {t.title}
          <span
            role="button"
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(t.relPath);
            }}
          >
            ×
          </span>
        </div>
      ))}
    </div>
  );
}
