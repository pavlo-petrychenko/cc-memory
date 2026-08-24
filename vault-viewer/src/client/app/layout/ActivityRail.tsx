type Props = {
  mode: "note" | "graph";
  onOpenPalette: () => void;
  onOpenGraph: () => void;
  onToggleTheme: () => void;
};

/** 44px icon rail on the far left. */
export function ActivityRail({ mode, onOpenPalette, onOpenGraph, onToggleTheme }: Props) {
  return (
    <div className="rail">
      <div className="rail-logo">◧</div>
      <button type="button" className="rail-btn" onClick={onOpenPalette} title="Search">
        ⌕
      </button>
      <button
        type="button"
        className={`rail-btn${mode === "graph" ? " active" : ""}`}
        onClick={onOpenGraph}
        title="Graph"
      >
        ⬡
      </button>
      <div className="rail-btn dimmed" title="Worklogs">
        ≡
      </div>
      <button
        type="button"
        className="rail-btn rail-bottom"
        onClick={onToggleTheme}
        title="Theme"
      >
        ◐
      </button>
    </div>
  );
}
