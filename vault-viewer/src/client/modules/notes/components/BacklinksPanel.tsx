import type { BacklinkDto } from "@shared/contracts/note.contract.js";

type Props = {
  backlinks: readonly BacklinkDto[];
  highlight: string;
  onOpen: (relPath: string) => void;
};

/** Split the snippet on every case-insensitive occurrence of `highlight` and
 * wrap matches in <mark> — no HTML injection, unlike the previous
 * dangerouslySetInnerHTML approach. */
function HighlightedSnippet({ snippet, term }: { snippet: string; term: string }) {
  const trimmed = term.trim();
  if (trimmed === "") return <>{snippet}</>;
  const parts = snippet.split(new RegExp(`(${escaped(trimmed)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function BacklinksPanel({
  backlinks,
  highlight,
  onOpen,
}: Props) {
  if (backlinks.length === 0) {
    return <div className="empty-note">No backlinks</div>;
  }
  return (
    <>
      {backlinks.map((b) => (
        <div key={b.relPath} className="backlink-card" onClick={() => onOpen(b.relPath)}>
          <div className="backlink-title">
            <span className="dot" />
            {b.title}
          </div>
          <div className="backlink-snippet">
            <HighlightedSnippet snippet={b.snippet} term={highlight} />
          </div>
          <div className="backlink-path">{b.relPath}</div>
        </div>
      ))}
    </>
  );
}
