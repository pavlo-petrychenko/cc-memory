import { Router } from "express";

import type { ControllerDeps } from "../controllers/deps.js";
import { getFile, getNote } from "../controllers/note.controller.js";
import { validate } from "../middlewares/validate.js";
import { fileQuerySchema, noteQuerySchema } from "../validators/note.schema.js";

export function noteRouter(deps: ControllerDeps): Router {
  const router = Router();
  router.get("/note", validate(noteQuerySchema, "query"), getNote(deps));
  router.get("/file", validate(fileQuerySchema, "query"), getFile(deps));
  return router;
}
