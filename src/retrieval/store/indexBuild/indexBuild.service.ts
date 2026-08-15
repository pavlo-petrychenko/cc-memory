import type { AbsPath } from "@/core/index.ts";
import { joinAbs, stripChars } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import type { Sqlite, SqlParameter } from "@/gateways/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import { NoteParser } from "@/knowledge/index.ts";
import { IndexConnectionService } from "@/retrieval/store/connection/connection.service.ts";
import type {
  BuildOptions,
  BuildStats,
  ExistingWorklogFile,
  UpsertedId,
} from "@/retrieval/store/indexBuild/indexBuild.typedefs.ts";
import { NoteUpsertOutcome } from "@/retrieval/store/indexBuild/indexBuild.typedefs.ts";

async function isDirectory(fs: FileSystem, path: AbsPath): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

/** Applied only to directory names during the walk — a `.md` file is never itself
 * checked, only the directories it's nested under. */
function isExcludedDir(relativePath: string, exclude: readonly string[]): boolean {
  if (relativePath.split("/").some((segment) => segment.startsWith("."))) return true;
  for (const rawExclude of exclude) {
    const trimmed = stripChars(rawExclude, "/");
    if (relativePath === trimmed || relativePath.startsWith(`${trimmed}/`)) return true;
  }
  return false;
}

async function walkDirLevel(
  fs: FileSystem,
  dir: AbsPath,
  relDir: string,
  exclude: readonly string[],
): Promise<readonly AbsPath[]> {
  const entryNames = [...(await fs.readDir(dir))].toSorted();
  const perEntry = await Promise.all(
    entryNames.map(async (name): Promise<readonly AbsPath[]> => {
      const childRelPath = relDir === "" ? name : `${relDir}/${name}`;
      const childAbsPath = joinAbs(dir, name);
      const stat = await fs.stat(childAbsPath);
      if (stat.isDirectory) {
        if (isExcludedDir(childRelPath, exclude)) return [];
        return walkDirLevel(fs, childAbsPath, childRelPath, exclude);
      }
      if (stat.isFile && name.endsWith(".md")) return [childAbsPath];
      return [];
    }),
  );
  return perEntry.flat();
}

function walkMarkdownFiles(
  fs: FileSystem,
  root: AbsPath,
  exclude: readonly string[],
): Promise<readonly AbsPath[]> {
  return walkDirLevel(fs, root, "", exclude);
}

/** A leading-dot-only "extension" (e.g. a file literally named `.md`) is not split
 * off — a dotfile is treated as having no extension. */
function fallbackTitleFromPath(path: AbsPath): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const lastDotIndex = base.lastIndexOf(".");
  return lastDotIndex <= 0 ? base : base.slice(0, lastDotIndex);
}

function requireUpsertedId(rows: readonly UpsertedId[]): number {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("upsert did not return an id via RETURNING — unreachable");
  }
  return row.id;
}

async function upsertNote(
  fs: FileSystem,
  db: Sqlite,
  path: AbsPath,
  mtime: number,
): Promise<boolean> {
  let text: string;
  try {
    text = await fs.readFile(path);
  } catch {
    return false;
  }
  const note = new NoteParser().parse(text, fallbackTitleFromPath(path));
  const upsertParams: readonly SqlParameter[] = [
    path,
    note.title,
    note.type,
    note.importance,
    mtime,
  ];
  const rows = db.query<UpsertedId>(
    "INSERT INTO notes(path,title,type,importance,mtime) VALUES(?,?,?,?,?) " +
      "ON CONFLICT(path) DO UPDATE SET title=excluded.title, type=excluded.type, " +
      "importance=excluded.importance, mtime=excluded.mtime RETURNING id",
    upsertParams,
  );
  const noteId = requireUpsertedId(rows);
  db.run("DELETE FROM notes_fts WHERE rowid=?", [noteId]);
  db.run("INSERT INTO notes_fts(rowid,title,body,tags,path) VALUES(?,?,?,?,?)", [
    noteId,
    note.title,
    note.body,
    note.tags,
    path,
  ]);
  db.run("DELETE FROM links WHERE src_path=?", [path]);
  for (const relation of note.rels) {
    db.run("INSERT INTO links(src_path,rel_type,dst) VALUES(?,?,?)", [
      path,
      relation.relationType,
      relation.target,
    ]);
  }
  return true;
}

async function upsertNoteIfChanged(
  fs: FileSystem,
  db: Sqlite,
  path: AbsPath,
  existingMtimeByPath: ReadonlyMap<string, number>,
  incremental: boolean,
): Promise<NoteUpsertOutcome> {
  const mtime = (await fs.stat(path)).mtimeMs;
  const existingMtime = existingMtimeByPath.get(path);
  if (
    incremental &&
    existingMtime !== undefined &&
    Math.abs(existingMtime - mtime) < 1e-6
  ) {
    return NoteUpsertOutcome.Skipped;
  }
  const upserted = await upsertNote(fs, db, path, mtime);
  if (!upserted) return NoteUpsertOutcome.Skipped;
  return existingMtime !== undefined
    ? NoteUpsertOutcome.Updated
    : NoteUpsertOutcome.Added;
}

async function upsertNotes(
  fs: FileSystem,
  db: Sqlite,
  workspace: Workspace,
  incremental: boolean,
): Promise<{
  readonly added: number;
  readonly updated: number;
  readonly seen: ReadonlySet<string>;
}> {
  if (!(await isDirectory(fs, workspace.kb))) {
    return { added: 0, updated: 0, seen: new Set() };
  }
  const existingRows = db.query<{ readonly path: string; readonly mtime: number }>(
    "SELECT path, mtime FROM notes",
    [],
  );
  const existingMtimeByPath = new Map(existingRows.map((row) => [row.path, row.mtime]));
  const paths = await walkMarkdownFiles(fs, workspace.kb, workspace.exclude);
  const outcomes = await Promise.all(
    paths.map((path) =>
      upsertNoteIfChanged(fs, db, path, existingMtimeByPath, incremental),
    ),
  );
  const added = outcomes.filter((outcome) => outcome === NoteUpsertOutcome.Added).length;
  const updated = outcomes.filter(
    (outcome) => outcome === NoteUpsertOutcome.Updated,
  ).length;
  return { added, updated, seen: new Set(paths) };
}

function pruneNotes(db: Sqlite, seen: ReadonlySet<string>): number {
  const rows = db.query<{ readonly id: number; readonly path: string }>(
    "SELECT id, path FROM notes",
    [],
  );
  let removed = 0;
  for (const row of rows) {
    if (seen.has(row.path)) continue;
    db.run("DELETE FROM notes WHERE id=?", [row.id]);
    db.run("DELETE FROM notes_fts WHERE rowid=?", [row.id]);
    db.run("DELETE FROM links WHERE src_path=?", [row.path]);
    removed += 1;
  }
  return removed;
}

async function upsertWorklogFile(
  fs: FileSystem,
  db: Sqlite,
  slug: string,
  date: string,
  path: AbsPath,
  mtime: number,
): Promise<void> {
  let body: string;
  try {
    body = await fs.readFile(path);
  } catch {
    return;
  }
  const rows = db.query<UpsertedId>(
    "INSERT INTO worklog_files(path,mtime) VALUES(?,?) " +
      "ON CONFLICT(path) DO UPDATE SET mtime=excluded.mtime RETURNING id",
    [path, mtime],
  );
  const fileId = requireUpsertedId(rows);
  db.run("DELETE FROM worklog_fts WHERE rowid=?", [fileId]);
  db.run("INSERT INTO worklog_fts(rowid,slug,date,body,path) VALUES(?,?,?,?,?)", [
    fileId,
    slug,
    date,
    body,
    path,
  ]);
}

function worklogDateFromFileName(fileName: string): string {
  return fileName === "STATE.md" ? "STATE" : fileName.slice(0, -3);
}

async function reindexWorklogFile(
  fs: FileSystem,
  db: Sqlite,
  slug: string,
  slugDir: AbsPath,
  fileName: string,
  existingByPath: ReadonlyMap<string, ExistingWorklogFile>,
): Promise<AbsPath> {
  const filePath = joinAbs(slugDir, fileName);
  const mtime = (await fs.stat(filePath)).mtimeMs;
  const existing = existingByPath.get(filePath);
  const unchanged = existing !== undefined && Math.abs(existing.mtime - mtime) < 1e-6;
  if (!unchanged) {
    await upsertWorklogFile(
      fs,
      db,
      slug,
      worklogDateFromFileName(fileName),
      filePath,
      mtime,
    );
  }
  return filePath;
}

async function reindexWorklogSlug(
  fs: FileSystem,
  db: Sqlite,
  worklogsRoot: AbsPath,
  slug: string,
  existingByPath: ReadonlyMap<string, ExistingWorklogFile>,
): Promise<readonly AbsPath[]> {
  if (slug.startsWith(".")) return [];
  const slugDir = joinAbs(worklogsRoot, slug);
  if (!(await isDirectory(fs, slugDir))) return [];
  const fileNames = [...(await fs.readDir(slugDir))]
    .toSorted()
    .filter((fileName) => fileName.endsWith(".md"));
  return Promise.all(
    fileNames.map((fileName) =>
      reindexWorklogFile(fs, db, slug, slugDir, fileName, existingByPath),
    ),
  );
}

async function buildWorklogs(
  fs: FileSystem,
  db: Sqlite,
  workspace: Workspace,
): Promise<void> {
  const existingRows = db.query<{
    readonly id: number;
    readonly path: string;
    readonly mtime: number;
  }>("SELECT id, path, mtime FROM worklog_files", []);
  const existingByPath = new Map(existingRows.map((row) => [row.path, row]));

  const worklogsExist = await isDirectory(fs, workspace.worklogs);
  const slugs = worklogsExist
    ? [...(await fs.readDir(workspace.worklogs))].toSorted()
    : [];
  const seenPerSlug = await Promise.all(
    slugs.map((slug) =>
      reindexWorklogSlug(fs, db, workspace.worklogs, slug, existingByPath),
    ),
  );
  const seen = new Set<string>(seenPerSlug.flat());

  for (const existing of existingRows) {
    if (seen.has(existing.path)) continue;
    db.run("DELETE FROM worklog_files WHERE id=?", [existing.id]);
    db.run("DELETE FROM worklog_fts WHERE rowid=?", [existing.id]);
  }
}

export class IndexBuildService {
  constructor(private readonly connectionService: IndexConnectionService) {}

  async build(
    container: Gateways,
    workspace: Workspace,
    options: BuildOptions = {},
  ): Promise<BuildStats> {
    const { db, forcedFullRebuild } = await this.connectionService.open(
      container,
      workspace,
    );
    const incremental = (options.incremental ?? true) && !forcedFullRebuild;

    const { added, updated, seen } = await upsertNotes(
      container.fs,
      db,
      workspace,
      incremental,
    );
    const removed = pruneNotes(db, seen);
    await buildWorklogs(container.fs, db, workspace);

    const totalRow = db.query<{ readonly "COUNT(*)": number }>(
      "SELECT COUNT(*) FROM notes",
      [],
    )[0];
    const total = totalRow?.["COUNT(*)"] ?? 0;
    return { added, updated, removed, total };
  }
}
