import { describe, expect, it } from "vitest";
import { workspaceDtoSchema, workspacesResponseSchema } from "./workspace.contract.js";

describe("workspace.contract", () => {
  it("parses valid workspace dto", () => {
    const dto = {
      id: "seed",
      kb: "/tmp/kb",
      tildifiedKb: "~/kb",
      worklogs: "/tmp/wl",
      exclude: [],
      noteCount: 6,
      indexFresh: "seed",
      source: "seed-fallback" as const,
    };
    expect(workspaceDtoSchema.parse(dto)).toEqual(dto);
  });

  it("parses workspaces response", () => {
    const res = { workspaces: [], source: "seed-fallback" };
    expect(workspacesResponseSchema.parse(res)).toEqual(res);
  });

  it("rejects missing id", () => {
    expect(() => workspaceDtoSchema.parse({ kb: "/tmp" })).toThrow();
  });
});
