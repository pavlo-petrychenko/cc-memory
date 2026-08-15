import { absPath, parentDir, relKey } from "@/core/index.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import {
  NOTES_SEARCH_TEMPLATE,
  SCHEMA,
  SCHEMA_VERSION,
  WEIGHTS_PLACEHOLDER,
  WORKLOG_SEARCH_TEMPLATE,
} from "@/gateways/searchIndex/searchIndex.constants.ts";
import {
  Collection,
  type Hit,
  type IndexDocument,
  type InlinkCounts,
  type SearchIndex,
} from "@/gateways/searchIndex/searchIndex.typedefs.ts";
import type { Sqlite, SqlParameter } from "@/gateways/sqlite/sqlite.typedefs.ts";

type SearchRow = {
  readonly path: string;
  readonly title: string;
  readonly snip: string;
  readonly score: number;
};

type UpsertedId = { readonly id: number };

function collapseWhitespace(text: string): string {
  return text
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .join(" ");
}

function basename(path: string): string {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === -1 ? path : path.slice(lastSlashIndex + 1);
}

/** A wikilink `dst` may carry a `|display` label — strip it before resolving. */
function beforePipe(raw: string): string {
  const pipeIndex = raw.indexOf("|");
  return (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
}

function requireUpsertedId(rows: readonly UpsertedId[]): number {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("upsert did not return an id via RETURNING — unreachable");
  }
  return row.id;
}

/** FTS5 over `bun:sqlite` — one handle per workspace, opened through the injected
 * `openDatabase` factory. Knows how to project documents and answer ranked queries;
 * knows nothing about notes or worklogs. */
export class SearchIndexAdapter implements SearchIndex {
  constructor(
    private readonly fs: FileSystem,
    private readonly openDatabase: (path: string) => Sqlite,
  ) {}

  private async open(workspace: Workspace): Promise<Sqlite> {
    await this.fs.mkdir(parentDir(workspace.indexDb));
    const db = this.openDatabase(workspace.indexDb);
    db.exec(SCHEMA);
    return db;
  }

  private reset(db: Sqlite): void {
    db.exec(
      "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS notes_fts; " +
        "DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS worklog_fts; " +
        "DROP TABLE IF EXISTS worklog_files;",
    );
    db.exec(SCHEMA);
    db.setUserVersion(SCHEMA_VERSION);
  }

  async resetIfStale(workspace: Workspace): Promise<boolean> {
    const db = await this.open(workspace);
    const stale = db.getUserVersion() < SCHEMA_VERSION;
    if (stale) this.reset(db);
    return stale;
  }

  async project(
    workspace: Workspace,
    collection: Collection,
    documents: readonly IndexDocument[],
  ): Promise<void> {
    const db = await this.open(workspace);
    for (const document of documents) {
      if (collection === Collection.Notes) {
        this.projectNote(db, document);
      } else {
        this.projectWorklog(db, document);
      }
    }
  }

  private projectNote(db: Sqlite, document: IndexDocument): void {
    const upsertParams: readonly SqlParameter[] = [
      document.path,
      document.title,
      document.type,
      document.importance,
      document.mtimeMs,
    ];
    const noteId = requireUpsertedId(
      db.query<UpsertedId>(
        "INSERT INTO notes(path,title,type,importance,mtime) VALUES(?,?,?,?,?) " +
          "ON CONFLICT(path) DO UPDATE SET title=excluded.title, type=excluded.type, " +
          "importance=excluded.importance, mtime=excluded.mtime RETURNING id",
        upsertParams,
      ),
    );
    db.run("DELETE FROM notes_fts WHERE rowid=?", [noteId]);
    db.run("INSERT INTO notes_fts(rowid,title,body,tags,path) VALUES(?,?,?,?,?)", [
      noteId,
      document.title,
      document.body,
      document.tags,
      document.path,
    ]);
    db.run("DELETE FROM links WHERE src_path=?", [document.path]);
    for (const relation of document.relations) {
      db.run("INSERT INTO links(src_path,rel_type,dst) VALUES(?,?,?)", [
        document.path,
        relation.relType,
        relation.dst,
      ]);
    }
  }

  private projectWorklog(db: Sqlite, document: IndexDocument): void {
    const fileId = requireUpsertedId(
      db.query<UpsertedId>(
        "INSERT INTO worklog_files(path,mtime) VALUES(?,?) " +
          "ON CONFLICT(path) DO UPDATE SET mtime=excluded.mtime RETURNING id",
        [document.path, document.mtimeMs],
      ),
    );
    db.run("DELETE FROM worklog_fts WHERE rowid=?", [fileId]);
    db.run("INSERT INTO worklog_fts(rowid,slug,date,body,path) VALUES(?,?,?,?,?)", [
      fileId,
      document.slug,
      document.date,
      document.body,
      document.path,
    ]);
  }

  async prune(
    workspace: Workspace,
    collection: Collection,
    keepPaths: ReadonlySet<string>,
  ): Promise<void> {
    const db = await this.open(workspace);
    if (collection === Collection.Notes) {
      const rows = db.query<{ readonly id: number; readonly path: string }>(
        "SELECT id, path FROM notes",
        [],
      );
      for (const row of rows) {
        if (keepPaths.has(row.path)) continue;
        db.run("DELETE FROM notes WHERE id=?", [row.id]);
        db.run("DELETE FROM notes_fts WHERE rowid=?", [row.id]);
        db.run("DELETE FROM links WHERE src_path=?", [row.path]);
      }
      return;
    }
    const rows = db.query<{ readonly id: number; readonly path: string }>(
      "SELECT id, path FROM worklog_files",
      [],
    );
    for (const row of rows) {
      if (keepPaths.has(row.path)) continue;
      db.run("DELETE FROM worklog_files WHERE id=?", [row.id]);
      db.run("DELETE FROM worklog_fts WHERE rowid=?", [row.id]);
    }
  }

  private renderQuery(collection: Collection, weights: readonly number[]): string {
    const template =
      collection === Collection.Notes ? NOTES_SEARCH_TEMPLATE : WORKLOG_SEARCH_TEMPLATE;
    const renderedWeights = weights.map((weight) => weight.toFixed(1)).join(", ");
    return template.replace(WEIGHTS_PLACEHOLDER, renderedWeights);
  }

  async query(
    workspace: Workspace,
    collection: Collection,
    expression: string,
    weights: readonly number[],
    limit: number,
  ): Promise<readonly Hit[]> {
    if (expression.trim() === "") return [];
    const db = await this.open(workspace);
    try {
      const rows = db.query<SearchRow>(this.renderQuery(collection, weights), [
        expression,
        limit,
      ]);
      return rows.map((row) => ({
        path: absPath(row.path),
        title: row.title,
        snippet: collapseWhitespace(row.snip),
        score: row.score,
      }));
    } catch {
      return [];
    }
  }

  async neighbors(
    workspace: Workspace,
    paths: readonly AbsPath[],
  ): Promise<InlinkCounts> {
    if (paths.length < 2) return new Map();

    const byRelKey = new Map<string, AbsPath>();
    const byBasename = new Map<string, AbsPath>();
    for (const path of paths) {
      const key = relKey(path, workspace.kb);
      byRelKey.set(key, path);
      byBasename.set(basename(key), path);
    }
    const candidateSet = new Set(paths);
    const inDegree = new Map<AbsPath, number>(paths.map((path) => [path, 0]));

    const db = await this.open(workspace);
    const placeholders = paths.map(() => "?").join(",");
    const rows = db.query<{ readonly src_path: string; readonly dst: string }>(
      `SELECT src_path, dst FROM links WHERE src_path IN (${placeholders})`,
      [...paths],
    );
    for (const row of rows) {
      const dst = beforePipe(row.dst);
      const target = byRelKey.get(dst) ?? byBasename.get(basename(dst));
      if (target !== undefined && candidateSet.has(target) && target !== row.src_path) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }
    return inDegree;
  }
}
