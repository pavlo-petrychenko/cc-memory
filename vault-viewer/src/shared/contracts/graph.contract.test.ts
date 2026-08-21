import { describe, expect, it } from "vitest";
import { graphQuerySchema } from "./graph.contract.js";

describe("graph.contract", () => {
  it("defaults depth and full", () => {
    const q = graphQuerySchema.parse({ workspace: "seed" });
    expect(q.depth).toBe(1);
    expect(q.full).toBe(false);
  });

  it("parses depth 2 and full=1", () => {
    const q = graphQuerySchema.parse({ workspace: "seed", depth: "2", full: "1" });
    expect(q.depth).toBe(2);
    expect(q.full).toBe(true);
  });

  it("rejects depth 3", () => {
    expect(() => graphQuerySchema.parse({ depth: 3 })).toThrow();
  });
});
