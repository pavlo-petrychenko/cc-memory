import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import express from "express";

import {
  API_PREFIX,
  DEFAULT_HOST,
  DEFAULT_PORT,
  STATIC_DIR_CANDIDATES,
} from "@/app/app.constants.ts";
import type {
  GraphEdge,
  GraphNode,
  GraphResponse,
  KbMapResponse,
  NoteListItem,
  NoteReadResponse,
  WorkspaceSummary,
} from "@/app/app.typedefs.ts";
import { joinAbs, relativeTo } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import type { AppContext } from "@/core/index.ts";
// eslint-disable no-await-in-loop, max-depth, no-nested-ternary, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion
import { FtsQueryBuilder, TokenizerParser } from "@/core/index.ts";
import { KbMapService } from "@/modules/kb/index.ts";
import { NoteRepository } from "@/modules/note/index.ts";
import { NoteService } from "@/modules/note/index.ts";
import { NoteParser } from "@/modules/note/index.ts";
import { WorklogService } from "@/modules/worklog/index.ts";
import { WorklogStoreService } from "@/modules/worklog/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/index.ts";

function resolveStaticDir(): string | null {
  const cwd = process.cwd();
  for (const candidate of STATIC_DIR_CANDIDATES) {
    const full = join(cwd, candidate);
    if (existsSync(join(full, "index.html"))) return full;
  }
  try {
    const distDir = join(cwd, "dist", "app");
    if (existsSync(join(distDir, "index.html"))) return distDir;
  } catch {
    // ignore
  }
  return null;
}

function featureOf(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** HTTP transport — Express app factory. Readonly in Phase 1. */
export class AppAdapter {
  private readonly ctx: AppContext;
  private readonly workspaceRepository: WorkspaceRepository;
  private readonly workspaceValidator: WorkspaceValidatorService;
  private readonly kbMapService: KbMapService;
  private readonly noteRepository: NoteRepository;
  private readonly noteService: NoteService;
  private readonly worklogStore: WorklogStoreService;
  private readonly noteParser: NoteParser;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.workspaceRepository = new WorkspaceRepository(ctx);
    this.workspaceValidator = new WorkspaceValidatorService(ctx);
    this.kbMapService = new KbMapService(ctx);
    this.noteRepository = new NoteRepository(ctx);
    this.noteService = new NoteService(ctx);
    this.worklogStore = new WorklogStoreService(ctx);
    this.noteParser = new NoteParser();
  }

  create(): express.Express {
    const app = express();
    app.use(express.json());

    app.get(`${API_PREFIX}/health`, (_req, res) => {
      res.json({ ok: true, version: "0.1.0" });
    });

    app.get(`${API_PREFIX}/workspaces`, async (_req, res) => {
      try {
        const home = this.ctx.gateways.env.home();
        const registryPath = this.workspaceRepository.defaultPath(home);
        const loaded = await this.workspaceRepository.load(registryPath);
        if (!loaded.ok) {
          res.status(500).json({ error: loaded.error.message });
          return;
        }
        const summaries: WorkspaceSummary[] = await Promise.all(
          loaded.value.map(async (raw) => {
            const expanded = this.workspaceValidator.expandWorkspace(raw, home);
            let noteCount: number | null = null;
            try {
              noteCount = await this.noteRepository.count(expanded);
            } catch {
              noteCount = null;
            }
            return {
              id: raw.id,
              kb: expanded.kb,
              worklogs: expanded.worklogs,
              indexDb: expanded.indexDb,
              match: [...expanded.match],
              exclude: [...expanded.exclude],
              noteCount,
            };
          }),
        );
        res.json(summaries);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/kb/map`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      try {
        const home = this.ctx.gateways.env.home();
        const built = await this.kbMapService.build(workspace, home);
        if (built === null) {
          const empty: KbMapResponse = {
            vaultLabel: workspace.kb,
            features: [],
            looseNotes: [],
          };
          res.json(empty);
          return;
        }
        const response: KbMapResponse = {
          vaultLabel: built.vaultLabel,
          features: built.features.map((feature) => ({
            name: feature.name,
            hasIndexNote: feature.hasIndexNote,
            title: feature.title,
            description: feature.description,
            epic: feature.epic,
          })),
          looseNotes: [...built.looseNotes],
        };
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/kb/notes`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      try {
        // eslint-disable-next-line anti-slop/no-runtime-typeof
        const rawFolder = req.query["folder"];
        // eslint-disable-next-line anti-slop/no-runtime-typeof
        const folder = typeof rawFolder === "string" ? rawFolder : undefined;
        const rows = await this.noteRepository.list(workspace, folder);
        const items: NoteListItem[] = rows.map((row) => ({
          path: row.path,
          title: row.title,
          type: row.type,
          importance: row.importance,
        }));
        res.json(items);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/kb/note`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const rawPathValue = req.query["path"];
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const rawPath = typeof rawPathValue === "string" ? rawPathValue : "";
      if (rawPath === "") {
        res.status(400).json({ error: "missing ?path=" });
        return;
      }
      try {
        // SAFETY: joinAbs returns a branded AbsPath — rawPath is vault-relative and stays under workspace.kb.
        let absPath = joinAbs(workspace.kb, rawPath) as AbsPath;
        let note = await this.noteRepository.readNote(workspace, absPath);
        let effectivePath = rawPath;
        if (note === null) {
          const rawNoMd = rawPath.endsWith(".md") ? rawPath.slice(0, -3) : rawPath;
          const candidates = [
            rawNoMd + ".md",
            `${rawNoMd}/${rawNoMd.split("/").pop()}.md`,
          ];
          for (const cand of candidates) {
            const tryAbs = joinAbs(workspace.kb, cand) as AbsPath;
            const tryNote = await this.noteRepository.readNote(workspace, tryAbs);
            if (tryNote !== null) {
              absPath = tryAbs;
              note = tryNote;
              effectivePath = cand;
              break;
            }
          }
        }
        if (note === null) {
          const rawNoMd = rawPath.endsWith(".md") ? rawPath.slice(0, -3) : rawPath;
          const targetLast = rawNoMd.split("/").pop()!.toLowerCase();
          const files = await this.noteRepository.scanFiles(workspace);
          for (const f of files) {
            const rel = relativeTo(f.path, workspace.kb);
            const stem = rel.split("/").pop()!.replace(/\.md$/, "").toLowerCase();
            if (stem === targetLast) {
              const tryNote = await this.noteRepository.readNote(workspace, f.path);
              if (tryNote !== null) {
                absPath = f.path;
                note = tryNote;
                effectivePath = rel;
                break;
              }
            }
          }
          if (note === null) {
            for (const f of files) {
              const rel = relativeTo(f.path, workspace.kb);
              if (rel.toLowerCase().endsWith(`/${targetLast}.md`)) {
                const tryNote = await this.noteRepository.readNote(workspace, f.path);
                if (tryNote !== null) {
                  absPath = f.path;
                  note = tryNote;
                  effectivePath = rel;
                  break;
                }
              }
            }
          }
        }
        if (note === null) {
          res.status(404).json({ error: `note not found: ${rawPath}` });
          return;
        }
        let mtimeMs = 0;
        try {
          const stat = await this.ctx.gateways.fs.stat(absPath);
          mtimeMs = stat.mtimeMs;
        } catch {
          mtimeMs = 0;
        }
        const frontmatter: Record<string, string | readonly string[]> = {};
        const response: NoteReadResponse = {
          path: effectivePath,
          title: note.title,
          type: note.type,
          importance: note.importance,
          frontmatter,
          body: note.body,
          rels: [...note.rels],
          mtimeMs,
        };
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/kb/graph`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      try {
        const files = await this.noteRepository.scanFiles(workspace);
        const perFile = await Promise.all(
          files.map(async (file) => {
            const note = await this.noteRepository.readNote(workspace, file.path);
            if (note === null) return null;
            const relPath = relativeTo(file.path, workspace.kb);
            return {
              // SAFETY: fields are taken from validated Note and derived feature — shape matches GraphNode.
              node: {
                id: relPath,
                title: note.title,
                type: note.type,
                importance: note.importance,
                feature: featureOf(relPath),
              } as GraphNode,
              edges: note.rels.map(
                (rel) =>
                  // SAFETY: src/dst/relType are direct string fields from the wikilink relation.
                  ({
                    src: relPath,
                    dst: rel.target,
                    relType: rel.relationType,
                  }) as GraphEdge,
              ),
            };
          }),
        );
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        for (const entry of perFile) {
          if (entry === null) continue;
          nodes.push(entry.node);
          edges.push(...entry.edges);
        }
        const response: GraphResponse = { nodes, edges };
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/kb/search`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const rawQuery = req.query["q"];
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const query = typeof rawQuery === "string" ? rawQuery : "";
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const rawK = req.query["k"];
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const rawLimit = typeof rawK === "string" ? Number.parseInt(rawK, 10) : 8;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 8;
      if (query.trim() === "") {
        res.json([]);
        return;
      }
      try {
        const hits = await this.noteService.search(workspace, query, {
          limit,
          linkBoost: this.ctx.config.linkBoost,
        });
        const payload = hits.map((hit) => ({
          path: relativeTo(hit.path, workspace.kb),
          title: hit.title,
          snippet: hit.snippet,
          score: hit.score,
        }));
        res.json(payload);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/worklogs/notes`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      try {
        const files = await this.worklogStore.scanWorklogFiles(workspace);
        const items = await Promise.all(
          files.map(async (file) => {
            const relPath = relativeTo(file.path, workspace.kb);
            let title = file.date === "STATE" ? `${file.slug} — STATE` : file.date;
            let type = file.date === "STATE" ? "worklog-state" : "worklog-journal";
            try {
              const text = await this.ctx.gateways.fs.readFile(file.path);
              const parsed = this.noteParser.parse(text, file.date);
              title = parsed.title || title;
              type = parsed.type || type;
            } catch {
              // keep fallback
            }
            return {
              path: relPath,
              title,
              type,
              importance: null as number | null,
              slug: file.slug,
              date: file.date,
            };
          }),
        );
        // Sort by path for stability
        items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        res.json(items);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get(`${API_PREFIX}/workspaces/:id/worklogs/graph`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      try {
        const files = await this.worklogStore.scanWorklogFiles(workspace);
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        for (const file of files) {
          const relPath = relativeTo(file.path, workspace.kb);
          let title = file.date === "STATE" ? `${file.slug} — STATE` : file.date;
          let rels: readonly { relationType: string; target: string }[] = [];
          try {
            const text = await this.ctx.gateways.fs.readFile(file.path);
            const parsed = this.noteParser.parse(text, file.date);
            title = parsed.title || title;
            rels = parsed.rels;
          } catch {
            // ignore
          }
          const slug = file.slug;
          nodes.push({
            id: relPath,
            title,
            type: file.date === "STATE" ? "worklog-state" : "worklog",
            importance: null,
            feature: `_Worklogs/${slug}`,
          } as GraphNode);
          for (const rel of rels) {
            edges.push({
              src: relPath,
              dst: rel.target,
              relType: rel.relationType,
            } as GraphEdge);
          }
        }
        const response: GraphResponse = { nodes, edges };
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // eslint-disable
    // ---- Playground — detailed breakdown for search & inject ----
    app.post(`${API_PREFIX}/playground/search`, async (req, res) => {
      const { workspaceId, query, limit, worklog } = req.body as {
        workspaceId?: string;
        query?: string;
        limit?: number;
        worklog?: boolean;
      };
      if (typeof workspaceId !== "string" || workspaceId === "") {
        res.status(400).json({ error: "workspaceId required" });
        return;
      }
      if (typeof query !== "string" || query.trim() === "") {
        res.status(400).json({ error: "query required" });
        return;
      }
      const workspace = await this.resolveWorkspace(workspaceId);
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${workspaceId}` });
        return;
      }
      try {
        const tokenizer = new TokenizerParser();
        const ftsBuilder = new FtsQueryBuilder(tokenizer);
        const tokens = [...tokenizer.salientTokens(query)].toSorted();
        const orderedTerms = [...tokenizer.orderedTerms(query)];
        const ftsQuery = ftsBuilder.ftsQuery(query);
        const phraseQuery = ftsBuilder.phraseQuery(query);
        const searchLimit =
          typeof limit === "number" && Number.isFinite(limit)
            ? Math.min(Math.max(limit, 1), 50)
            : 8;
        // For playground we use the same search path but also expose the raw FTS strings
        const hits = worklog
          ? await new WorklogService(this.ctx).search(workspace, query, {
              limit: searchLimit,
              linkBoost: this.ctx.config.linkBoost,
            })
          : await this.noteService.search(workspace, query, {
              limit: searchLimit,
              linkBoost: this.ctx.config.linkBoost,
            });
        res.json({
          query,
          tokens,
          orderedTerms,
          ftsQuery,
          phraseQuery,
          hits: hits.map((hit) => ({
            path: relativeTo(hit.path, worklog ? workspace.worklogs : workspace.kb),
            title: hit.title,
            snippet: hit.snippet,
            score: hit.score,
          })),
          config: {
            linkBoost: this.ctx.config.linkBoost,
            injectMinScore: this.ctx.config.injectMinScore,
          },
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.post(`${API_PREFIX}/playground/inject`, async (req, res) => {
      const { workspaceId, prompt, cwd } = req.body as {
        workspaceId?: string;
        prompt?: string;
        cwd?: string;
      };
      if (typeof workspaceId !== "string" || workspaceId === "") {
        res.status(400).json({ error: "workspaceId required" });
        return;
      }
      if (typeof prompt !== "string") {
        res.status(400).json({ error: "prompt required" });
        return;
      }
      const workspace = await this.resolveWorkspace(workspaceId);
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${workspaceId}` });
        return;
      }
      try {
        const tokenizer = new TokenizerParser();
        const ftsBuilder = new FtsQueryBuilder(tokenizer);
        const trimmed = prompt.trim();
        const tokens = [...tokenizer.salientTokens(prompt)].toSorted();
        const orderedTerms = [...tokenizer.orderedTerms(prompt)];
        const ftsQuery = ftsBuilder.ftsQuery(prompt);
        const phraseQuery = ftsBuilder.phraseQuery(prompt);
        const gate = {
          promptLength: trimmed.length,
          minPromptLength: 12,
          salientTokens: tokens.length,
          minSalientTokens: 2,
          injectMinScore: this.ctx.config.injectMinScore,
          linkBoost: this.ctx.config.linkBoost,
          maxInjectedNotes: 4,
          maxInjectedWorklogs: 1,
          gated: trimmed.length < 12 || tokens.length < 2,
        };
        let notePool: Awaited<ReturnType<NoteService["search"]>> = [];
        let worklogPool: Awaited<ReturnType<NoteService["search"]>> = [];
        let injectedNotes: typeof notePool = [];
        let injectedWorklogs: typeof worklogPool = [];
        if (!gate.gated) {
          const worklogService = new WorklogService(this.ctx);
          notePool = await this.noteService.search(workspace, prompt, {
            limit: 8,
            linkBoost: this.ctx.config.linkBoost,
          });
          worklogPool = await worklogService.search(workspace, prompt, {
            limit: 1,
            linkBoost: this.ctx.config.linkBoost,
          });
          injectedNotes = notePool
            .filter((hit) => -hit.score >= this.ctx.config.injectMinScore)
            .slice(0, 4);
          injectedWorklogs = worklogPool
            .filter((hit) => -hit.score >= this.ctx.config.injectMinScore)
            .slice(0, 1);
        }
        res.json({
          prompt,
          cwd: cwd ?? null,
          tokens,
          orderedTerms,
          ftsQuery,
          phraseQuery,
          gate,
          notePool: notePool.map((hit) => ({
            path: relativeTo(hit.path, workspace.kb),
            title: hit.title,
            snippet: hit.snippet,
            score: hit.score,
          })),
          worklogPool: worklogPool.map((hit) => ({
            path: relativeTo(hit.path, workspace.worklogs),
            title: hit.title,
            snippet: hit.snippet,
            score: hit.score,
          })),
          injected: {
            notes: injectedNotes.map((hit) => ({
              path: relativeTo(hit.path, workspace.kb),
              title: hit.title,
              snippet: hit.snippet,
              score: hit.score,
            })),
            worklogs: injectedWorklogs.map((hit) => ({
              path: relativeTo(hit.path, workspace.worklogs),
              title: hit.title,
              snippet: hit.snippet,
              score: hit.score,
            })),
          },
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.post(`${API_PREFIX}/playground/session`, async (req, res) => {
      const { workspaceId, cwd } = req.body as { workspaceId?: string; cwd?: string };
      if (typeof workspaceId !== "string" || workspaceId === "") {
        res.status(400).json({ error: "workspaceId required" });
        return;
      }
      const workspace = await this.resolveWorkspace(workspaceId);
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${workspaceId}` });
        return;
      }
      try {
        const targetCwd = (
          typeof cwd === "string" && cwd !== "" ? cwd : this.ctx.gateways.env.cwd()
        ) as AbsPath;
        const { SessionStartUseCase } =
          await import("@/modules/memory/useCases/sessionStart.useCase.ts");
        const useCase = new SessionStartUseCase(this.ctx);
        const result = await useCase.execute({ workspace, cwd: targetCwd });
        res.json({ workspaceId, cwd: targetCwd, result });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.post(`${API_PREFIX}/playground/resolve`, async (req, res) => {
      const { cwd } = req.body as { cwd?: string };
      try {
        const home = this.ctx.gateways.env.home();
        const registryPath = this.workspaceRepository.defaultPath(home);
        const loaded = await this.workspaceRepository.load(registryPath);
        if (!loaded.ok) {
          res.json({
            cwd: cwd ?? this.ctx.gateways.env.cwd(),
            home,
            resolved: null,
            workspaces: [],
          });
          return;
        }
        const targetCwd =
          typeof cwd === "string" && cwd !== "" ? cwd : this.ctx.gateways.env.cwd();
        // Longest-prefix match
        let best: { id: string; match: string } | null = null;
        for (const raw of loaded.value) {
          const expanded = this.workspaceValidator.expandWorkspace(raw, home);
          for (const m of expanded.match) {
            if (targetCwd === m || targetCwd.startsWith(m + "/")) {
              if (best === null || m.length > best.match.length)
                best = { id: raw.id, match: m };
            }
          }
        }
        res.json({
          cwd: targetCwd,
          home,
          resolved: best,
          workspaces: loaded.value.map((r) => r.id),
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // eslint-enable
    app.get(`${API_PREFIX}/workspaces/:id/worklogs/tree`, async (req, res) => {
      const workspace = await this.resolveWorkspace(req.params.id ?? "");
      if (workspace === null) {
        res.status(404).json({ error: `workspace not found: ${req.params.id}` });
        return;
      }
      try {
        const fs = this.ctx.gateways.fs;
        // SAFETY: Workspace.worklogs is already a validated AbsPath from registry expansion.
        const worklogsDir = workspace.worklogs as AbsPath;
        let slugs: string[] = [];
        try {
          slugs = [...(await fs.readDir(worklogsDir))].toSorted();
        } catch {
          slugs = [];
        }
        const tree = await Promise.all(
          slugs.map(async (slug) => {
            // SAFETY: slug is a directory entry under worklogs, joining preserves AbsPath branding.
            const slugDir = joinAbs(worklogsDir, slug) as AbsPath;
            let files: string[] = [];
            try {
              files = [...(await fs.readDir(slugDir))].toSorted();
            } catch {
              files = [];
            }
            return { slug, files };
          }),
        );
        res.json(tree);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    const staticDir = resolveStaticDir();
    if (staticDir !== null) {
      app.use(express.static(staticDir));
      app.get("*", (_req, res) => {
        const indexPath = join(staticDir, "index.html");
        try {
          const html = readFileSync(indexPath, "utf8");
          res.setHeader("Content-Type", "text/html");
          res.send(html);
        } catch {
          res.status(404).send("dist/app not found — run build:app");
        }
      });
    } else {
      app.get("/", (_req, res) => {
        res
          .status(200)
          .send(
            "cc-memory app: React build not found. Run `npm --prefix app/web run build` to generate dist/app.",
          );
      });
    }

    return app;
  }

  private async resolveWorkspace(
    id: string,
  ): Promise<import("@/core/index.ts").Workspace | null> {
    if (id === "") return null;
    const home = this.ctx.gateways.env.home();
    const registryPath = this.workspaceRepository.defaultPath(home);
    const loaded = await this.workspaceRepository.load(registryPath);
    if (!loaded.ok) return null;
    const raw = loaded.value.find((entry) => entry.id === id);
    if (raw === undefined) return null;
    return this.workspaceValidator.expandWorkspace(raw, home);
  }

  static readonly DEFAULT_PORT = DEFAULT_PORT;
  static readonly DEFAULT_HOST = DEFAULT_HOST;
}
