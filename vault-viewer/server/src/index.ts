import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { api } from "./routes/api.js";
import { watch } from "chokidar";

const PORT = Number.parseInt(process.env.PORT ?? "3415", 10);
const CLIENT_DIST_CANDIDATES = [resolve("vault-viewer/client/dist"), resolve("client/dist"), resolve(process.cwd(), "client/dist")];
const CLIENT_DIST = CLIENT_DIST_CANDIDATES.find((p) => existsSync(p)) ?? resolve("vault-viewer/client/dist");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", api);

// serve client dist if built
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (_req, res) => res.sendFile(join(CLIENT_DIST, "index.html")));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[vault-viewer api] listening on http://localhost:${PORT}`);
  console.log(`[vault-viewer api] registry: ~/.claude/memory/registry.toml (or seed vault)`);
});

// watch for changes — just log, client polls via re-fetch
try {
  const watcher = watch([resolve("vault-viewer/seed-vault")], { ignored: /(^|[\/\\])\../, persistent: false });
  watcher.on("change", (p) => console.log("[watch] changed", p));
} catch {}
