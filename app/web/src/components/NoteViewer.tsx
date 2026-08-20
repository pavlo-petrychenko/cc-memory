import { marked } from "marked";

import type { NoteRead } from "../api/client.ts";

type Props = {
  note: NoteRead | null;
  onWikilinkClick: (target: string) => void;
};

function wikilinkToPath(target: string): string {
  // Pass raw target — App's resolver will map "Langfuse" → "Langfuse/Langfuse.md" etc.
  return target;
}

export function NoteViewer({ note, onWikilinkClick }: Props) {
  if (note === null)
    return (
      <div style={{ padding: 24, color: "#8b95a5", fontSize: 13 }}>
        Select a note from the map or search results
      </div>
    );

  // Make wikilinks clickable before markdown rendering: replace [[path|label]] with [label](wikilink:path)
  // Encode target so spaces/parentheses don't break markdown link syntax.
  const withLinks = note.body.replace(
    /\[\[([^|\]]+)\|([^\]]+)\]\]/g,
    (_m, target: string, label: string) =>
      `[${label}](wikilink:${encodeURIComponent(target)})`,
  );
  const withLinks2 = withLinks.replace(
    /\[\[([^\]]+)\]\]/g,
    (_m, target: string) => `[${target}](wikilink:${encodeURIComponent(target)})`,
  );
  const html = marked.parse(withLinks2, { async: false }) as string;

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (anchor === null) return;
    const href = anchor.getAttribute("href");
    if (href === null || !href.startsWith("wikilink:")) return;
    event.preventDefault();
    const raw = href.slice("wikilink:".length);
    let target: string;
    try {
      target = decodeURIComponent(raw);
    } catch {
      target = raw;
    }
    onWikilinkClick(wikilinkToPath(target));
  };

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{ marginBottom: 12, borderBottom: "1px solid #2a303c", paddingBottom: 12 }}
      >
        <h1 style={{ fontSize: 18, margin: 0 }}>{note.title}</h1>
        <div
          style={{
            fontSize: 11,
            color: "#8b95a5",
            marginTop: 4,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>{note.path}</span>
          <span>type: {note.type}</span>
          {note.importance !== null && <span>importance: {note.importance}</span>}
        </div>
        {note.rels.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {note.rels.map((rel) => (
              <button
                key={`${rel.relationType}:${rel.target}`}
                onClick={() => onWikilinkClick(wikilinkToPath(rel.target))}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #2a303c",
                  background: "#1e232b",
                  color: "#c9d1de",
                  cursor: "pointer",
                }}
              >
                {rel.relationType} → {rel.target}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* eslint-disable-next-line react/no-danger */}
      <div
        onClick={handleClick}
        style={{ fontSize: 13, lineHeight: 1.6, color: "#c9d1de" }}
        dangerouslySetInnerHTML={{ __html: html as string }}
      />
      <style>{`
        div h1, div h2, div h3 { color: #e6e8ec; margin-top: 16px; }
        div a { color: #7c86ff; }
        div code { background: #0f1115; padding: 1px 4px; border-radius: 4px; font-size: 12px; }
        div pre { background: #0f1115; padding: 12px; border-radius: 8px; overflow: auto; }
      `}</style>
    </div>
  );
}
