import type { NoteDto } from "@shared/contracts/note.contract.js";

import { BacklinksPanel } from "./BacklinksPanel.js";

type Props = {
  note: NoteDto | null;
  onOpen: (relPath: string) => void;
  onWikilink: (target: string, newTab: boolean) => void;
};

function outlineHeadings(body: string): { depth: number; text: string }[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .slice(0, 8)
    .map((line) => ({
      depth: line.match(/^#+/)?.[0].length ?? 1,
      text: line.replace(/^#+\s*/, ""),
    }));
}

/** Right dock for note mode: outgoing links, backlinks, tags, outline. */
export function NoteDock({ note, onOpen, onWikilink }: Props) {
  const headings = note !== null ? outlineHeadings(note.body) : [];
  return (
    <>
      <div className="panel-header">Links</div>
      <div className="panel-body">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Outgoing · {note?.outgoing.length ?? 0}
          </div>
          {note?.outgoing.length ? (
            note.outgoing.map((r, i) => (
              <div
                key={`${r.target}-${i}`}
                className="link-row"
                onClick={() => onWikilink(r.target, false)}
              >
                <span className="rel-type">{r.relationType}</span>
                <span className="link-target">{r.target}</span>
              </div>
            ))
          ) : (
            <div className="empty-note">No outgoing links</div>
          )}
        </div>
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Backlinks · {note?.backlinks.length ?? 0}
          </div>
          <BacklinksPanel
            backlinks={note?.backlinks ?? []}
            highlight={note?.title ?? ""}
            onOpen={onOpen}
          />
        </div>
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Tags
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {note && note.tags.length > 0 ? (
              note.tags.map((t) => (
                <span key={t} className="tag-pill">
                  #{t}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>
            )}
          </div>
        </div>
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Outline
          </div>
          <div className="outline-list">
            {headings.length > 0 ? (
              headings.map((h, i) => (
                <div key={i} className="outline-row" style={{ paddingLeft: h.depth * 8 }}>
                  {h.text}
                </div>
              ))
            ) : (
              <div style={{ fontStyle: "italic" }}>No headings</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
