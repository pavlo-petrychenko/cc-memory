import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${config.port}`);
});

function graceful(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => graceful("SIGTERM"));
process.on("SIGINT", () => graceful("SIGINT"));
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledRejection]", reason);
});
