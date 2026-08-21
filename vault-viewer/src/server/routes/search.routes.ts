import { Router } from "express";

import type { ControllerDeps } from "../controllers/deps.js";
import { search } from "../controllers/search.controller.js";
import { validate } from "../middlewares/validate.js";
import { searchQuerySchema } from "../validators/search.schema.js";

export function searchRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/", validate(searchQuerySchema, "query"), search(deps));
  return router;
}
