import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";

import { parseNote } from "../../server/parser.js";
import { loadWorkspaces } from "../../server/registry.js";
import {
  walkKb as legacyWalkKb,
  buildKbTree as legacyBuildKbTree,
  scanWorklogs as legacyScanWorklogs,
  searchNotes as legacySearchNotes,
} from "../../server/vault.js";
import type { Config } from "./config/env.js";
import { ForbiddenError, NotFoundError } from "./errors/appError.js";
import { asyncHandler } from "./errors/asyncHandler.js";
import { NodeFileSystem } from "./gateways/fs.gateway.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { requestId } from "./middlewares/requestId.js";
import { validate } from "./middlewares/validate.js";
import { VaultCache } from "./services/vault.cache.js";
import { buildKbTree, searchNotes } from "./services/vault.pure.js";
import { VaultService } from "./services/vault.service.js";
import { assertInside, isSafeRelPath } from "./utils/path.js";
import { workspaceQuerySchema } from "./validators/common.schema.js";
import { graphQuerySchema } from "./validators/graph.schema.js";
import { noteQuerySchema, fileQuerySchema } from "./validators/note.schema.js";
import { searchQuerySchema } from "./validators/search.schema.js";
import { treeQuerySchema } from "./validators/tree.schema.js";
import {
  worklogQuerySchema,
  reindexBodySchema,
  reindexQuerySchema,
} from "./validators/worklog.schema.js";

export function createApp(config: Config): express.Express {
  const logger = pino({ level: config.LOG_LEVEL });
  const fs = new NodeFileSystem();
  const vaultService = new VaultService(fs);
  const vaultCache = new VaultCache(fs, vaultService);
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: false,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(requestId);
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      message: "cc-memory API — UI is at http://localhost:3415",
      api: "/api/workspaces",
      worktrees: "../cc-memory-*",
    });
  });

  let workspacesCache: Awaited<ReturnType<typeof loadWorkspaces>> | null = null;

  async function getWorkspaces(): Promise<Awaited<ReturnType<typeof loadWorkspaces>>> {
    if (!workspacesCache) {
      workspacesCache = await loadWorkspaces();
    }
    return workspacesCache;
  }

  function bustCache(): void {
    workspacesCache = null;
    vaultCache.bustAll();
  }

  function requireWorkspace(
    workspaces: Awaited<ReturnType<typeof loadWorkspaces>>["workspaces"],
    wid: string | undefined,
  ): (typeof workspaces)[number] | null {
    if (!wid) {
      return workspaces[0] ?? null;
    }
    const found = workspaces.find((w) => w.id === wid);
    if (!found) {
      throw new NotFoundError(`workspace ${wid}`);
    }
    return found;
  }

  // GET /api/workspaces — no validation
  app.get(
    "/api/workspaces",
    asyncHandler(async (_req, res) => {
      const { workspaces, source } = await getWorkspaces();
      const enriched = await Promise.all(
        workspaces.map(async (w) => {
          const notes = await vaultCache.get(w.kb, w.exclude);
          let indexFresh = "seed";
          try {
            const st = await stat(w.indexDb);
            const ageMin = Math.round((Date.now() - st.mtimeMs) / 60000);
            indexFresh =
              ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
          } catch {
            // keep seed
          }
          if (source === "seed-fallback") indexFresh = "seed";
          return {
            id: w.id,
            kb: w.kb,
            worklogs: w.worklogs,
            tildifiedKb: w.tildifiedKb,
            exclude: w.exclude,
            noteCount: notes.length,
            indexFresh,
            source,
          };
        }),
      );
      res.json({ workspaces: enriched, source });
    }),
  );

  // GET /api/tree
  app.get(
    "/api/tree",
    validate(treeQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const { workspace: wid } = req.query as { workspace?: string };
      const { workspaces } = await getWorkspaces();
      const ws = requireWorkspace(workspaces, wid);
      if (!ws) throw new NotFoundError("workspace");
      const notes = await vaultCache.get(ws.kb, ws.exclude);
      const kbTree = buildKbTree(notes);
      const worklogs = await vaultService.scanWorklogs(ws.worklogs);
      res.json({
        kbTree,
        worklogs,
        notes: notes.map((n) => ({
          relPath: n.relPath,
          title: n.title,
          type: n.type,
          importance: n.importance,
          tags: n.tags,
        })),
      });
    }),
  );

  // GET /api/note
  app.get(
    "/api/note",
    validate(noteQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const { workspace: wid, path: relPath } = req.query as {
        workspace?: string;
        path: string;
      };

      if (!isSafeRelPath(relPath)) {
        throw new ForbiddenError("invalid path");
      }

      const { workspaces } = await getWorkspaces();
      const ws = requireWorkspace(workspaces, wid);
      if (!ws) throw new NotFoundError("workspace");

      // sandbox check for both kb and worklogs
      const candidates = [join(ws.kb, relPath), join(ws.worklogs, relPath)];
      let abs: string | null = null;
      let isWorklog = false;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i] as string;
        try {
          await stat(c);
          abs = c;
          isWorklog = i === 1;
          break;
        } catch {
          // continue
        }
      }
      if (!abs) throw new NotFoundError(`note ${relPath}`);

      // assert inside
      const resolved = resolve(abs);
      try {
        assertInside(ws.kb, resolved);
      } catch {
        try {
          assertInside(ws.worklogs, resolved);
        } catch {
          throw new ForbiddenError("outside vault");
        }
      }

      const text = await readFile(abs, "utf8").catch(() => "");
      const fallback = relPath.split("/").pop()?.replace(".md", "") ?? relPath;
      const parsed = parseNote(text, fallback);

      const notes = await vaultCache.get(ws.kb, ws.exclude);
      const outgoing = parsed.rels;
      const relKey = relPath.replace(/\.md$/, "");
      const titleLower = parsed.title.toLowerCase();
      const backlinks: { relPath: string; title: string; snippet: string }[] = [];
      for (const n of notes) {
        if (n.relPath === relPath) continue;
        for (const r of n.rels) {
          const tgt = r.target.toLowerCase();
          if (
            tgt === relKey.toLowerCase() ||
            tgt === titleLower ||
            tgt === fallback.toLowerCase()
          ) {
            const idx = n.body.toLowerCase().indexOf(`[[${r.target.toLowerCase()}`);
            let snippet = "";
            if (idx >= 0) {
              const start = Math.max(0, idx - 40);
              snippet = n.body
                .slice(start, idx + 80)
                .replace(/\s+/g, " ")
                .trim();
            } else {
              snippet = n.body.slice(0, 80).replace(/\s+/g, " ").trim();
            }
            backlinks.push({ relPath: n.relPath, title: n.title, snippet });
            break;
          }
        }
      }

      res.json({
        relPath,
        ...parsed,
        backlinks: backlinks.slice(0, 20),
        outgoing,
        isWorklog,
      });
    }),
  );

  // GET /api/file
  app.get(
    "/api/file",
    validate(fileQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const { workspace: wid, path: relPath } = req.query as {
        workspace?: string;
        path: string;
      };

      if (!isSafeRelPath(relPath)) {
        throw new ForbiddenError("invalid path");
      }

      const { workspaces } = await getWorkspaces();
      const ws = requireWorkspace(workspaces, wid);
      if (!ws) throw new NotFoundError("workspace");

      const candidates = [join(ws.kb, relPath), join(ws.worklogs, relPath)];
      let abs: string | null = null;
      for (const c of candidates) {
        try {
          await stat(c);
          abs = c;
          break;
        } catch {
          // continue
        }
      }
      if (!abs) throw new NotFoundError(`file ${relPath}`);

      const resolved = resolve(abs);
      let inside = false;
      try {
        assertInside(ws.kb, resolved);
        inside = true;
      } catch {
        // try worklogs
      }
      try {
        assertInside(ws.worklogs, resolved);
        inside = true;
      } catch {
        // continue
      }
      // also handle exact root case
      if (resolved === resolve(ws.kb) || resolved === resolve(ws.worklogs)) inside = true;
      if (!inside) throw new ForbiddenError("outside vault");

      const ext = extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
      };
      res.setHeader("Content-Type", mimeMap[ext] ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=3600");
      try {
        const st = await stat(resolved);
        const etag = `W/"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;
        res.setHeader("ETag", etag);
      } catch {
        // ignore
      }

      res.sendFile(resolved);
    }),
  );

  // GET /api/search
  app.get(
    "/api/search",
    validate(searchQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const {
        workspace: wid,
        q,
        type,
        tag,
        feature,
      } = req.query as {
        workspace?: string;
        q: string;
        type?: string;
        tag?: string;
        feature?: string;
      };
      const { workspaces } = await getWorkspaces();
      // search should return empty if no workspace — not 404, per legacy but with explicit 404 for unknown
      let ws: (typeof workspaces)[number] | null = null;
      if (wid) {
        const found = workspaces.find((w) => w.id === wid);
        if (!found) throw new NotFoundError(`workspace ${wid}`);
        ws = found;
      } else {
        ws = workspaces[0] ?? null;
      }
      if (!ws) {
        res.json({ hits: [] });
        return;
      }
      const notes = await vaultCache.get(ws.kb, ws.exclude);
      const hits = searchNotes(notes, q, { type, tag, feature });
      res.json({
        hits: hits.map((h) => ({
          relPath: h.note.relPath,
          title: h.note.title,
          type: h.note.type,
          importance: h.note.importance,
          tags: h.note.tags,
          snippet: h.note.body.slice(0, 120).replace(/\s+/g, " ").trim(),
          score: h.score,
        })),
      });
    }),
  );

  // GET /api/graph
  app.get(
    "/api/graph",
    validate(graphQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const {
        workspace: wid,
        focus,
        depth,
        full,
      } = req.query as unknown as {
        workspace?: string;
        focus?: string;
        depth: number;
        full: boolean;
      };
      const { workspaces } = await getWorkspaces();
      const ws = requireWorkspace(workspaces, wid);
      if (!ws) {
        res.json({ nodes: [], edges: [] });
        return;
      }
      const notes = await vaultCache.get(ws.kb, ws.exclude);
      const byRel = new Map(notes.map((n) => [n.relPath, n] as const));
      const byTitleLower = new Map(notes.map((n) => [n.title.toLowerCase(), n] as const));
      const allEdges: { source: string; target: string; relationType: string }[] = [];
      for (const n of notes) {
        for (const r of n.rels) {
          let targetRel: string | null = null;
          const tryPaths = [`${r.target}.md`, `${r.target}`];
          for (const tp of tryPaths) {
            if (byRel.has(tp)) {
              targetRel = tp;
              break;
            }
          }
          if (!targetRel) {
            const byTitle = byTitleLower.get(r.target.toLowerCase());
            if (byTitle) targetRel = byTitle.relPath;
          }
          if (targetRel) {
            allEdges.push({
              source: n.relPath,
              target: targetRel,
              relationType: r.relationType,
            });
          }
        }
      }
      let nodes: typeof notes = [];
      let edges = allEdges;
      if (full || !focus) {
        nodes = notes.slice(0, 500);
        const visible = new Set(nodes.map((n) => n.relPath));
        edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target));
      } else {
        const visited = new Set<string>();
        let frontier = new Set<string>([focus]);
        visited.add(focus);
        for (let d = 0; d < depth; d++) {
          const next = new Set<string>();
          for (const e of allEdges) {
            if (frontier.has(e.source) && !visited.has(e.target)) {
              visited.add(e.target);
              next.add(e.target);
            }
            if (frontier.has(e.target) && !visited.has(e.source)) {
              visited.add(e.source);
              next.add(e.source);
            }
          }
          frontier = next;
          if (frontier.size === 0) break;
        }
        nodes = notes.filter((n) => visited.has(n.relPath));
        const visible = new Set(nodes.map((n) => n.relPath));
        edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target));
      }
      res.json({
        nodes: nodes.map((n) => ({
          id: n.relPath,
          title: n.title,
          type: n.type,
          importance: n.importance,
          tags: n.tags,
        })),
        edges,
      });
    }),
  );

  // GET /api/worklog
  app.get(
    "/api/worklog",
    validate(worklogQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const { workspace: wid, slug } = req.query as { workspace?: string; slug: string };
      const { workspaces } = await getWorkspaces();
      const ws = requireWorkspace(workspaces, wid);
      if (!ws) throw new NotFoundError("workspace");
      const worklogs = await vaultService.scanWorklogs(ws.worklogs);
      const found = worklogs.find((s) => s.slug === slug);
      if (!found) throw new NotFoundError(`worklog ${slug}`);
      res.json(found);
    }),
  );

  // POST /api/reindex
  app.post(
    "/api/reindex",
    // support both query and body — query wins
    validate(reindexQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      const qid = (req.query as { workspace?: string }).workspace;
      let bid: string | undefined;
      if (req.body && typeof req.body.workspace === "string") {
        const parsed = reindexBodySchema.safeParse(req.body);
        if (parsed.success) bid = parsed.data.workspace;
      }
      const wid = qid ?? bid;
      const { workspaces } = await getWorkspaces();
      let ws: (typeof workspaces)[number] | null = null;
      if (wid) {
        const found = workspaces.find((w) => w.id === wid);
        if (!found) throw new NotFoundError(`workspace ${wid}`);
        ws = found;
      } else {
        ws = workspaces[0] ?? null;
      }
      if (!ws) {
        res.json({ added: 0, updated: 0, removed: 0, total: 0 });
        return;
      }
      const notes = await vaultCache.get(ws.kb, ws.exclude);
      bustCache();
      res.json({ added: notes.length, updated: 0, removed: 0, total: notes.length });
    }),
  );

  // 404 and error handler last
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
