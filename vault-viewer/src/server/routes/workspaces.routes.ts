import { Router } from "express";
import { listWorkspaces } from "../controllers/workspaces.controller.js";
import type { ControllerDeps } from "../controllers/deps.js";

export function workspacesRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/", listWorkspaces(deps));
  return router;
}
