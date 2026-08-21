import type { Request, Response } from "express";
import { NotFoundError } from "../errors/appError.js";
import {
  reindexBodySchema,
  reindexQuerySchema,
  worklogQuerySchema,
} from "../validators/worklog.schema.js";
import type { ControllerDeps } from "./deps.js";

/** GET /api/worklog — one worklog tree: pinned STATE.md plus dated entries. */
export function getWorklog(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace, slug } = worklogQuerySchema.parse(req.query);
    const ws = await deps.scope.resolve(workspace);
    if (!ws) throw new NotFoundError("workspace");
    const found = await deps.vaultService.scanWorklogSlug(ws.worklogs, slug);
    if (!found) throw new NotFoundError(`worklog ${slug}`);
    res.json(found);
  };
}

const EMPTY_REINDEX = { added: 0, updated: 0, removed: 0, total: 0 };

/** POST /api/reindex — busts vault caches so the next read re-walks the vault.
 * Query param wins over an (optional, validated) JSON body. */
export function reindex(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace: qid } = reindexQuerySchema.parse(req.query);
    const body = reindexBodySchema.safeParse(req.body);
    const bid = body.success ? body.data.workspace : undefined;
    const ws = await deps.scope.resolve(qid ?? bid);
    if (!ws) {
      res.json(EMPTY_REINDEX);
      return;
    }
    const notes = await deps.vaultCache.get(ws.kb, ws.exclude);
    deps.scope.bust();
    res.json({ added: notes.length, updated: 0, removed: 0, total: notes.length });
  };
}
