import type { Request, Response } from "express";
import { buildKbTree } from "../services/vault.pure.js";
import { treeQuerySchema } from "../validators/tree.schema.js";
import type { ControllerDeps } from "./deps.js";

/** GET /api/tree — KB directory tree, worklog slugs, and note metadata. */
export function getTree(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace } = treeQuerySchema.parse(req.query);
    const ws = await deps.scope.resolve(workspace);
    if (!ws) {
      res.json({ kbTree: { name: "", path: "", type: "dir", children: [] }, worklogs: [], notes: [] });
      return;
    }
    const notes = await deps.vaultCache.get(ws.kb, ws.exclude);
    const worklogs = await deps.vaultService.scanWorklogs(ws.worklogs);
    res.json({
      kbTree: buildKbTree(notes),
      worklogs,
      notes: notes.map((n) => ({
        relPath: n.relPath,
        title: n.title,
        type: n.type,
        importance: n.importance,
        tags: n.tags,
      })),
    });
  };
}
