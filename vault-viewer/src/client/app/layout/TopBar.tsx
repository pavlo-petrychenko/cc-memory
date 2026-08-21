import { useTheme } from "../providers/theme.provider.js";
import { useWorkspace } from "../providers/workspace.provider.js";

type Props = {
  q: string;
  onQChange: (v: string) => void;
  onOpenPalette: () => void;
  mode: "note" | "graph";
  onModeChange: (mode: "note" | "graph") => void;
};

/** Top chrome: workspace picker, global search box, view toggle, theme. */
export function TopBar({ q, onQChange, onOpenPalette, mode, onModeChange }: Props) {
  const { theme, toggle } = useTheme();
  const { workspaces, activeWs, setActiveWs } = useWorkspace();
  const active = workspaces.find((w) => w.id === activeWs);

  return (
    <div className="topbar">
      <div className="topbar-group">
        <span className="brand-dot" />
        <select
          className="select"
          value={activeWs}
          onChange={(e) => setActiveWs(e.target.value)}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              ◈ {w.id} — {w.tildifiedKb}
            </option>
          ))}
        </select>
        <span className="note-count-chip">{active?.noteCount ?? 0} notes</span>
      </div>

      <div className="searchbox">
        <span className="glyph">⌕</span>
        <input
          value={q}
          onChange={(e) => {
            onQChange(e.target.value);
            onOpenPalette();
          }}
          onFocus={onOpenPalette}
          placeholder="Search  titles, tags, body…  (⌘K)"
        />
        <kbd className="kbd">⌘K</kbd>
      </div>

      <div className="topbar-right">
        <div className="mode-toggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            className={mode === "note" ? "active" : ""}
            onClick={() => onModeChange("note")}
          >
            Notes
          </button>
          <button
            type="button"
            className={mode === "graph" ? "active" : ""}
            onClick={() => onModeChange("graph")}
          >
            Graph
          </button>
        </div>
        <button className="icon-btn" onClick={toggle} title="Toggle theme">
          {theme === "dark" ? "◐" : "☀"}
        </button>
      </div>
    </div>
  );
}
