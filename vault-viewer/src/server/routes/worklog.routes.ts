import { Router } from "express";

import type { ControllerDeps } from "../controllers/deps.js";
import { getWorklog, reindex } from "../controllers/worklog.controller.js";
import { validate } from "../middlewares/validate.js";
import {
  reindexBodySchema,
  reindexQuerySchema,
  worklogQuerySchema,
} from "../validators/worklog.schema.js";

export function worklogRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/", validate(worklogQuerySchema, "query"), getWorklog(deps));
  // Body is validated too when present; an empty/absent JSON body parses fine
  // because `workspace` is optional in the schema.
  router.post(
    "/reindex",
    validate(reindexQuerySchema, "query"),
    validate(reindexBodySchema, "body"),
    reindex(deps),
  );
  return router;
}
