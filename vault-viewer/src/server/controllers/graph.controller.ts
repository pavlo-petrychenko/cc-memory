import type { Request, Response } from "express";

import { buildGraphEdges, subgraph } from "../services/vault.pure.js";
import { graphQuerySchema } from "../validators/graph.schema.js";
import type { ControllerDeps } from "./deps.js";

/** GET /api/graph — nodes/edges for the force graph, capped or focus-expanded. */
export function graph(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace, focus, depth, full } = graphQuerySchema.parse(req.query);
    const ws = await deps.scope.resolve(workspace);
    if (!ws) {
      res.json({ nodes: [], edges: [] });
      return;
    }
    const notes = await deps.vaultCache.get(ws.kb, ws.exclude);
    const allEdges = buildGraphEdges(notes);
    const { nodes, edges } = subgraph(notes, allEdges, focus ?? null, depth, full);
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
  };
}
