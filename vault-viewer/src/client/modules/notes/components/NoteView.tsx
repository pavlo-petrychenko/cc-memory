import type { NoteDto } from "@shared/contracts/note.contract.js";

import { Markdown } from "../../markdown/components/Markdown.js";

type Props = {
  note: NoteDto;
  workspace: string;
  onWikilink: (target: string, newTab: boolean) => void;
  knownTargets: ReadonlySet<string>;
};

function dirOf(relPath: string): string {
  return relPath.split("/").slice(0, -1).join(" / ") || "—";
}

/** The reading view for one KB note: breadcrumb, title, meta chips, markdown. */
export function NoteView({ note, workspace, onWikilink, knownTargets }: Props) {
  return (
    <div className="content-scroll">
      <div className="reading-col">
        <div className="note-breadcrumb">
          <span>{dirOf(note.relPath)}</span>
          <span className="sep">/</span>
          <b>{note.title}</b>
          <span className="relchip">{note.relPath}</span>
        </div>
        <h1 className="note-title">{note.title}</h1>
        <div className="note-meta">
          <span className="meta-chip">
            <b className="accent">type</b> {note.type}
          </span>
          {note.importance !== null && (
            <span className={`meta-chip${note.importance >= 8 ? " danger" : ""}`}>
              <b>imp</b> {String(note.importance)}
            </span>
          )}
          {note.tags.length > 0 && (
            <span className="meta-chip">
              <b className="green">tags</b> {note.tags.join(" ")}
            </span>
          )}
          {note.epic && (
            <span className="meta-chip">
              <b>epic</b> {note.epic}
            </span>
          )}
        </div>
        <div className="markdown-card">
          <Markdown
            body={note.body}
            workspace={workspace}
            currentPath={note.relPath}
            onWikilink={onWikilink}
            knownTargets={knownTargets}
          />
        </div>
      </div>
    </div>
  );
}
