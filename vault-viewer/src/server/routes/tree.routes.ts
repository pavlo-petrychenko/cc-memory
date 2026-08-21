import { Router } from "express";

import type { ControllerDeps } from "../controllers/deps.js";
import { getTree } from "../controllers/tree.controller.js";
import { validate } from "../middlewares/validate.js";
import { treeQuerySchema } from "../validators/tree.schema.js";

export function treeRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/", validate(treeQuerySchema, "query"), getTree(deps));
  return router;
}
