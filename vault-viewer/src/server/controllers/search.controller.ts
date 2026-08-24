import type { Request, Response } from "express";

import { searchNotes } from "../services/vault.pure.js";
import { searchQuerySchema } from "../validators/search.schema.js";
import type { ControllerDeps } from "./deps.js";

const SNIPPET_LENGTH = 120;

/** GET /api/search — naive ranked search over the walked KB. An absent
 * workspace (empty registry) yields an empty hit list, not a 404. */
export function search(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace, q, type, tag, feature } = searchQuerySchema.parse(req.query);
    const ws = await deps.scope.resolve(workspace);
    if (!ws) {
      res.json({ hits: [] });
      return;
    }
    const notes = await deps.vaultCache.get(ws.kb, ws.exclude);
    const hits = searchNotes(notes, q, { type, tag, feature });
    res.json({
      hits: hits.map((h) => ({
        relPath: h.note.relPath,
        title: h.note.title,
        type: h.note.type,
        importance: h.note.importance,
        tags: h.note.tags,
        snippet: h.note.body.slice(0, SNIPPET_LENGTH).replace(/\s+/g, " ").trim(),
        score: h.score,
      })),
    });
  };
}
