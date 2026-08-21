import { Router } from "express";
import { graph } from "../controllers/graph.controller.js";
import type { ControllerDeps } from "../controllers/deps.js";
import { validate } from "../middlewares/validate.js";
import { graphQuerySchema } from "../validators/graph.schema.js";

export function graphRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/", validate(graphQuerySchema, "query"), graph(deps));
  return router;
}
