import type { Request, Response } from "express";
import type { ControllerDeps } from "./deps.js";

/** GET /api/workspaces — registry snapshot with per-workspace note counts and
 * index freshness. */
export function listWorkspaces(deps: ControllerDeps) {
  return async (_req: Request, res: Response): Promise<void> => {
    const { workspaces, source } = await deps.scope.list();
    const enriched = await Promise.all(
      workspaces.map(async (ws) => {
        const notes = await deps.vaultCache.get(ws.kb, ws.exclude);
        return deps.vaultService.enrichWorkspace(ws, source, notes);
      }),
    );
    res.json({ workspaces: enriched, source });
  };
}
