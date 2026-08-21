import type { NoteMetaDto } from "@shared/contracts/tree.contract.js";

type Props = {
  suggestions: readonly NoteMetaDto[];
  onOpen: (relPath: string) => void;
  onOpenPalette: () => void;
};

export function EmptyState({ suggestions, onOpen, onOpenPalette }: Props) {
  return (
    <div className="empty-state">
      <div>
        <div className="big-glyph">▸</div>
        <div className="title">No note open</div>
        <div className="hint">
          Pick from Explorer or hit <kbd className="kbd">⌘K</kbd> to search
        </div>
        <div className="suggest-row">
          {suggestions.map((n) => (
            <button key={n.relPath} type="button" className="suggest-btn" onClick={() => onOpen(n.relPath)}>
              {n.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NotFoundState({ path, onClose }: { path: string; onClose: () => void }) {
  return (
    <div className="notfound">
      <div className="label">Not found</div>
      <div className="path">{path} — unresolved wikilink or missing file</div>
      <button
        type="button"
        onClick={onClose}
        style={{ marginTop: 12 }}
        className="btn btn-subtle"
      >
        Close tab
      </button>
    </div>
  );
}
