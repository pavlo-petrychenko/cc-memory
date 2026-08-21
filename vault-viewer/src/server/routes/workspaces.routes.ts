import { Router } from "express";

import type { ControllerDeps } from "../controllers/deps.js";
import { listWorkspaces } from "../controllers/workspaces.controller.js";

export function workspacesRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/", listWorkspaces(deps));
  return router;
}
