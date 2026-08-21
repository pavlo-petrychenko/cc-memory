type EmbedBlockProps = {
  target: string;
  onWikilink?: (target: string) => void;
};

export function EmbedBlock({ target, onWikilink }: EmbedBlockProps) {
  return (
    <div className="embed-block">
      <span className="embed-badge">EMBED</span>
      <span className="embed-target">{target}</span>
      <button type="button" className="embed-open" onClick={() => onWikilink?.(target)}>
        Open
      </button>
    </div>
  );
}
