import type { Express } from "express";
import type { ControllerDeps } from "../controllers/deps.js";
import { graphRouter } from "./graph.routes.js";
import { noteRouter } from "./note.routes.js";
import { searchRouter } from "./search.routes.js";
import { treeRouter } from "./tree.routes.js";
import { worklogRouter } from "./worklog.routes.js";
import { workspacesRouter } from "./workspaces.routes.js";

/** Mounts every API router under `/api`. Order is irrelevant — paths are
 * disjoint — but keep the list alphabetical to make additions obvious. */
export function registerRoutes(app: Express, deps: ControllerDeps): void {
  app.use("/api/workspaces", workspacesRouter(deps));
  app.use("/api/tree", treeRouter(deps));
  app.use("/api/search", searchRouter(deps));
  app.use("/api/graph", graphRouter(deps));
  app.use("/api/worklog", worklogRouter(deps));
  // note routes carry their own sub-paths (/api/note, /api/file)
  app.use("/api", noteRouter(deps));
}
