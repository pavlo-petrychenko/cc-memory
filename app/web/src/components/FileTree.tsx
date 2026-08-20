import { useMemo, useState } from "react";

import type { NoteListItem, WorklogNoteItem } from "../api/client.ts";

type FileTreeProps = {
  notes: NoteListItem[];
  worklogNotes?: WorklogNoteItem[];
  selectedPath: string | null;
  onOpen: (path: string) => void;
};

type TreeFolder = {
  name: string;
  fullPath: string;
  children: Map<string, TreeFolder>;
  files: NoteListItem[];
};

function buildTree(notes: NoteListItem[], worklogNotes: WorklogNoteItem[]): TreeFolder {
  const all: NoteListItem[] = [...notes, ...worklogNotes];
  const root: TreeFolder = { name: "", fullPath: "", children: new Map(), files: [] };
  for (const note of all) {
    const parts = note.path.split("/");
    let cur = root;
    let curPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      curPath = curPath ? `${curPath}/${part}` : part;
      let child = cur.children.get(part);
      if (!child) {
        child = { name: part, fullPath: curPath, children: new Map(), files: [] };
        cur.children.set(part, child);
      }
      cur = child;
    }
    cur.files.push({ ...note, path: note.path });
  }
  // sort files by title, folders with _Worklogs first
  const sortRec = (folder: TreeFolder) => {
    folder.files.sort((a, b) => a.title.localeCompare(b.title));
    for (const child of folder.children.values()) sortRec(child);
  };
  sortRec(root);
  return root;
}

function sortFolderEntries(entries: TreeFolder[]): TreeFolder[] {
  return entries.sort((a, b) => {
    if (a.name === "_Worklogs" && b.name !== "_Worklogs") return -1;
    if (b.name === "_Worklogs" && a.name !== "_Worklogs") return 1;
    return a.name.localeCompare(b.name);
  });
}

function FolderRow({
  folder,
  depth,
  expanded,
  toggle,
  selectedPath,
  onOpen,
  filter,
}: {
  folder: TreeFolder;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedPath: string | null;
  onOpen: (path: string) => void;
  filter: string;
}) {
  const isExpanded = expanded.has(folder.fullPath);
  const lowerFilter = filter.toLowerCase();
  const matchesFilter = (name: string) =>
    lowerFilter === "" || name.toLowerCase().includes(lowerFilter);

  // Collect visible children after filter
  const childFolders = sortFolderEntries(
    [...folder.children.values()].filter((c) => {
      if (matchesFilter(c.name)) return true;
      const hasMatch = (f: TreeFolder): boolean => {
        if (f.files.some((file) => matchesFilter(file.title) || matchesFilter(file.path)))
          return true;
        for (const child of f.children.values()) if (hasMatch(child)) return true;
        return false;
      };
      return hasMatch(c);
    }),
  );

  const visibleFiles = folder.files.filter(
    (f) => matchesFilter(f.title) || matchesFilter(f.path),
  );

  if (folder.fullPath === "") {
    // root: render its folders/files without row itself
    return (
      <>
        {childFolders.map((child) => (
          <FolderRow
            key={child.fullPath}
            folder={child}
            depth={depth}
            expanded={expanded}
            toggle={toggle}
            selectedPath={selectedPath}
            onOpen={onOpen}
            filter={filter}
          />
        ))}
        {visibleFiles.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            depth={depth}
            selectedPath={selectedPath}
            onOpen={onOpen}
          />
        ))}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={() => toggle(folder.fullPath)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "#c9d1de",
          cursor: "pointer",
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          fontSize: 12,
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 9, color: "#5a6577", width: 10 }}>
          {isExpanded ? "▾" : "▸"}
        </span>
        <span style={{ fontSize: 13 }}>{isExpanded ? "📂" : "📁"}</span>
        <span
          style={{
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {folder.name}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#5a6577" }}>
          {folder.files.length + folder.children.size > 0 ? `${folder.files.length}` : ""}
        </span>
      </button>
      {isExpanded && (
        <div style={{ borderLeft: "1px solid #1e232b", marginLeft: 14 + depth * 14 }}>
          {childFolders.map((child) => (
            <FolderRow
              key={child.fullPath}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedPath={selectedPath}
              onOpen={onOpen}
              filter={filter}
            />
          ))}
          {visibleFiles.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              depth={depth + 1}
              selectedPath={selectedPath}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  depth,
  selectedPath,
  onOpen,
}: {
  file: NoteListItem;
  depth: number;
  selectedPath: string | null;
  onOpen: (path: string) => void;
}) {
  const isActive = file.path === selectedPath;
  const isIndex = file.type === "index";
  const isWorklog = file.path.startsWith("_Worklogs/");
  const isState = isWorklog && file.path.endsWith("STATE.md");
  return (
    <button
      onClick={() => onOpen(file.path)}
      title={file.path}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        textAlign: "left",
        background: isActive ? "#1e232b" : "transparent",
        border: isActive ? "1px solid #2a303c" : "1px solid transparent",
        borderLeft: isActive ? "2px solid #7c86ff" : "1px solid transparent",
        color: isActive ? "#e6e8ec" : isWorklog ? "#9aa4b8" : "#8b95a5",
        cursor: "pointer",
        padding: `3px 8px 3px ${8 + depth * 14}px`,
        fontSize: 12,
        borderRadius: 6,
        margin: "1px 4px",
      }}
    >
      <span style={{ fontSize: 12 }}>
        {isState ? "◆" : isWorklog ? "📝" : isIndex ? "🗂️" : "📄"}
      </span>
      <span
        style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {file.title}
      </span>
    </button>
  );
}

export function FileTree({
  notes,
  worklogNotes = [],
  selectedPath,
  onOpen,
}: FileTreeProps) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add("_Worklogs");
    return s;
  });

  const tree = useMemo(() => buildTree(notes, worklogNotes), [notes, worklogNotes]);

  // Auto-expand when filter is active
  const expandedForRender = useMemo(() => {
    if (filter.trim() === "") return expanded;
    // expand all when filtering
    const all = new Set<string>();
    const walk = (folder: TreeFolder) => {
      if (folder.fullPath) all.add(folder.fullPath);
      for (const child of folder.children.values()) walk(child);
    };
    walk(tree);
    return all;
  }, [expanded, filter, tree]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      <div style={{ padding: 8, borderBottom: "1px solid #1e232b", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files…"
            style={{
              width: "100%",
              background: "#0f1115",
              color: "#e6e8ec",
              border: "1px solid #2a303c",
              borderRadius: 8,
              padding: "6px 28px 6px 8px",
              fontSize: 12,
            }}
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              style={{
                position: "absolute",
                right: 6,
                top: 5,
                background: "transparent",
                border: "none",
                color: "#5a6577",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: "#5a6577" }}>
          {notes.length} notes
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "6px 0", minHeight: 0 }}>
        <FolderRow
          folder={tree}
          depth={0}
          expanded={expandedForRender}
          toggle={toggle}
          selectedPath={selectedPath}
          onOpen={onOpen}
          filter={filter}
        />
      </div>
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid #1e232b",
          fontSize: 10,
          color: "#5a6577",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>▸ Folders</span>
        <span style={{ marginLeft: "auto" }}>dark</span>
      </div>
    </div>
  );
}
