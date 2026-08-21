import cors from "cors";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";

import type { Config } from "./config/env.js";
import { NodeFileSystem } from "./gateways/fs.gateway.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { requestId } from "./middlewares/requestId.js";
import { registerRoutes } from "./routes/index.js";
import { VaultCache } from "./services/vault.cache.js";
import { VaultService } from "./services/vault.service.js";
import { WorkspaceScope } from "./services/workspaceScope.service.js";

/** Composition root for the HTTP layer: builds the service graph, wires
 * middleware, mounts the routers. Route handlers live in `routes/` +
 * `controllers/`; vault logic lives in `services/`. */
export function createApp(config: Config): express.Express {
  const logger = pino({ level: config.LOG_LEVEL });
  const fs = new NodeFileSystem();
  const vaultService = new VaultService(fs);
  const vaultCache = new VaultCache(fs, vaultService);
  const scope = new WorkspaceScope(vaultCache);
  const deps = { scope, vaultService, vaultCache };

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: false,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(requestId);
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      message: "cc-memory API — UI is at http://localhost:3415",
      api: "/api/workspaces",
      worktrees: "../cc-memory-*",
    });
  });

  registerRoutes(app, deps);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
