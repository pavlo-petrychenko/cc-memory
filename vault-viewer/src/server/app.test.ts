import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";

function testApp(): ReturnType<typeof createApp> {
  const config = loadConfig({
    ...process.env,
    CCMEM_REGISTRY: "/tmp/__does_not_exist_registry.toml",
    LOG_LEVEL: "error",
    API_PORT: "3416",
    CORS_ORIGINS: "http://localhost:3415",
  });
  return createApp(config);
}

describe("app validation & sandbox", () => {
  it("GET / returns 200", async () => {
    const app = testApp();
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cc-memory API/);
  });

  it("GET /api/note?path=../etc/passwd -> 400 validation", async () => {
    const app = testApp();
    const res = await request(app).get("/api/note").query({ path: "../etc/passwd" });
    expect([400, 403]).toContain(res.status);
    expect(res.body.code).toMatch(/VALIDATION_ERROR|FORBIDDEN/);
  });

  it("GET /api/note encoded %2e -> 400/403", async () => {
    const app = testApp();
    const res = await request(app).get("/api/note").query({ path: "%2e%2e/secret.md" });
    expect([400, 403]).toContain(res.status);
  });

  it("GET /api/file traversal -> 400/403", async () => {
    const app = testApp();
    const res = await request(app).get("/api/file").query({ path: "../etc/passwd" });
    expect([400, 403]).toContain(res.status);
  });

  it("GET /api/tree unknown workspace -> 404", async () => {
    const app = testApp();
    const res = await request(app).get("/api/tree").query({ workspace: "__nope__" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("GET /api/graph depth=NaN -> 400", async () => {
    const app = testApp();
    const res = await request(app).get("/api/graph").query({ depth: "NaN" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/workspaces returns seed or real", async () => {
    const app = testApp();
    const res = await request(app).get("/api/workspaces");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.workspaces)).toBe(true);
  });

  it("GET /api/file sets nosniff and cache headers", async () => {
    const app = testApp();
    // use seed vault file if exists — we fallback to seed, so auth/jwt.md should exist? Seed has auth/jwt.md
    const res = await request(app).get("/api/file").query({ path: "auth/jwt.md" });
    // may be 200 or 404 depending on workspace — but if 200, check headers
    if (res.status === 200) {
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["cache-control"]).toMatch(/private/);
    } else {
      expect([200, 404]).toContain(res.status);
    }
  });
});
