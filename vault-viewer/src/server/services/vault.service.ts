import { join, basename } from "node:path";

import { parseNote } from "../../../server/parser.js";
import type { NoteFile, WorklogSlug, WorklogEntry } from "../../../server/vault.js";
import type { FileSystem } from "../gateways/fs.gateway.js";
import type { WorkspaceEntry } from "./workspaceScope.service.js";

export class VaultService {
  constructor(private readonly fs: FileSystem) {}

  async walkKb(kbPath: string, exclude: string[]): Promise<NoteFile[]> {
    const out: NoteFile[] = [];

    // check if kbPath exists and is dir
    try {
      const st = await this.fs.stat(kbPath);
      if (!st.isDirectory()) return [];
    } catch {
      return [];
    }

    const walk = async (dir: string, relDir: string): Promise<void> => {
      let entries: string[] = [];
      try {
        const dirents = await this.fs.readdir(dir, { withFileTypes: true });
        // dirents is Dirent[] when withFileTypes true, else string[]
        // handle both
        if (
          dirents.length > 0 &&
          typeof dirents[0] === "object" &&
          "name" in (dirents[0] as unknown as Record<string, unknown>)
        ) {
          const d = dirents as unknown as {
            name: string;
            isDirectory(): boolean;
            isFile(): boolean;
          }[];
          entries = d.map((x) => x.name);
          // sort case-insensitive
          entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
          for (const name of entries) {
            if (name.startsWith(".")) continue;
            const childRel = relDir ? `${relDir}/${name}` : name;
            const ent = d.find((x) => x.name === name);
            const isDirectory = ent ? ent.isDirectory() : false;
            if (isDirectory) {
              const relForExclude = childRel;
              const excluded = exclude.some((e) => {
                const trimmed = e.replace(/^\/+|\/+$/g, "");
                return (
                  relForExclude === trimmed || relForExclude.startsWith(trimmed + "/")
                );
              });
              if (excluded) continue;
              await walk(join(dir, name), childRel);
            } else if (name.endsWith(".md")) {
              if (relDir === "" && /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
              const absPath = join(dir, name);
              try {
                const st = await this.fs.stat(absPath);
                const text = await this.fs.readFile(absPath, "utf8");
                const fallback = basename(name, ".md");
                const parsed = parseNote(text, fallback);
                out.push({
                  absPath,
                  relPath: childRel,
                  ...parsed,
                  mtimeMs: st.mtimeMs,
                });
              } catch {
                // swallow per file
              }
            }
          }
          return;
        } else {
          entries = dirents as unknown as string[];
        }
      } catch {
        return;
      }

      entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      for (const name of entries) {
        if (name.startsWith(".")) continue;
        const childRel = relDir ? `${relDir}/${name}` : name;
        const full = join(dir, name);
        let isDirectory = false;
        try {
          const st = await this.fs.stat(full);
          isDirectory = st.isDirectory();
        } catch {
          continue;
        }
        if (isDirectory) {
          const relForExclude = childRel;
          const excluded = exclude.some((e) => {
            const trimmed = e.replace(/^\/+|\/+$/g, "");
            return relForExclude === trimmed || relForExclude.startsWith(trimmed + "/");
          });
          if (excluded) continue;
          await walk(full, childRel);
        } else if (name.endsWith(".md")) {
          if (relDir === "" && /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
          const absPath = full;
          try {
            const st = await this.fs.stat(absPath);
            const text = await this.fs.readFile(absPath, "utf8");
            const fallback = basename(name, ".md");
            const parsed = parseNote(text, fallback);
            out.push({
              absPath,
              relPath: childRel,
              ...parsed,
              mtimeMs: st.mtimeMs,
            });
          } catch {
            // swallow
          }
        }
      }
    };

    await walk(kbPath, "");
    return out;
  }

  async scanWorklogs(worklogsPath: string): Promise<WorklogSlug[]> {
    let stat: { isDirectory(): boolean } | null = null;
    try {
      stat = await this.fs.stat(worklogsPath);
    } catch {
      return [];
    }
    if (!stat.isDirectory()) return [];

    let slugs: string[] = [];
    try {
      slugs = (await this.fs.readdir(worklogsPath)) as unknown as string[];
    } catch {
      return [];
    }
    slugs = slugs.filter((s) => !s.startsWith(".")).sort();
    const out: WorklogSlug[] = [];
    for (const slug of slugs) {
      const slugPath = join(worklogsPath, slug);
      try {
        const st = await this.fs.stat(slugPath);
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }
      let entries: WorklogEntry[] = [];
      let stateBody: string | undefined;
      let stateExists = false;
      try {
        const files = (await this.fs.readdir(slugPath)) as unknown as string[];
        for (const f of files) {
          const abs = join(slugPath, f);
          try {
            const st = await this.fs.stat(abs);
            if (!st.isFile()) continue;
          } catch {
            continue;
          }
          if (f === "STATE.md") {
            stateExists = true;
            try {
              stateBody = await this.fs.readFile(abs, "utf8");
            } catch {}
          } else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) {
            try {
              const body = await this.fs.readFile(abs, "utf8");
              entries.push({ date: f.replace(".md", ""), body, relPath: `${slug}/${f}` });
            } catch {}
          }
        }
      } catch {}
      entries.sort((a, b) => b.date.localeCompare(a.date));
      out.push({ slug, stateExists, stateBody, entries });
    }
    return out;
  }

  async scanWorklogSlug(worklogsPath: string, slug: string): Promise<WorklogSlug | null> {
    const slugPath = join(worklogsPath, slug);
    try {
      const st = await this.fs.stat(slugPath);
      if (!st.isDirectory()) return null;
    } catch {
      return null;
    }
    let entries: WorklogEntry[] = [];
    let stateBody: string | undefined;
    let stateExists = false;
    try {
      const files = (await this.fs.readdir(slugPath)) as unknown as string[];
      for (const f of files) {
        const abs = join(slugPath, f);
        try {
          const st = await this.fs.stat(abs);
          if (!st.isFile()) continue;
        } catch {
          continue;
        }
        if (f === "STATE.md") {
          stateExists = true;
          try {
            stateBody = await this.fs.readFile(abs, "utf8");
          } catch {}
        } else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) {
          try {
            const body = await this.fs.readFile(abs, "utf8");
            entries.push({ date: f.replace(".md", ""), body, relPath: `${slug}/${f}` });
          } catch {}
        }
      }
    } catch {
      return null;
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return { slug, stateExists, stateBody, entries };
  }

  /** Per-workspace listing payload: note count from the cached walk plus the
   * index-freshness age derived from `index.db`'s mtime. */
  async enrichWorkspace(
    ws: WorkspaceEntry,
    source: string,
    notes: readonly NoteFile[],
  ): Promise<EnrichedWorkspace> {
    let indexFresh = "seed";
    if (source !== "seed-fallback" && ws.indexDb !== "") {
      try {
        const st = await this.fs.stat(ws.indexDb);
        const ageMin = Math.round((Date.now() - st.mtimeMs) / 60000);
        indexFresh = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
      } catch {
        // keep seed
      }
    }
    return {
      id: ws.id,
      kb: ws.kb,
      worklogs: ws.worklogs,
      tildifiedKb: ws.tildifiedKb,
      exclude: ws.exclude,
      noteCount: notes.length,
      indexFresh,
      source,
    };
  }

  /** Resolves a relPath against a workspace's kb then worklogs roots. Returns
   * the absolute path plus which root served it, or null when neither has it.
   * The caller still owns the sandbox assertion (assertInside). */
  async resolveVaultFile(
    ws: WorkspaceEntry,
    relPath: string,
  ): Promise<{ absPath: string; isWorklog: boolean } | null> {
    const candidates = [
      { abs: join(ws.kb, relPath), isWorklog: false },
      { abs: join(ws.worklogs, relPath), isWorklog: true },
    ];
    for (const candidate of candidates) {
      try {
        await this.fs.stat(candidate.abs);
        return { absPath: candidate.abs, isWorklog: candidate.isWorklog };
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  async readFileText(absPath: string): Promise<string> {
    try {
      return await this.fs.readFile(absPath, "utf8");
    } catch {
      return "";
    }
  }

  /** Size + mtime for ETag generation; throws when the file is gone. */
  async statMtime(absPath: string): Promise<{ size: number; mtimeMs: number }> {
    const st = await this.fs.stat(absPath);
    return { size: st.size, mtimeMs: st.mtimeMs };
  }
}

export type EnrichedWorkspace = {
  id: string;
  kb: string;
  worklogs: string;
  tildifiedKb: string;
  exclude: string[];
  noteCount: number;
  indexFresh: string;
  source: string;
};
