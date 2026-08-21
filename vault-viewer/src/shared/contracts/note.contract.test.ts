import { describe, expect, it } from "vitest";
import { noteSchema } from "./note.contract.js";

describe("note.contract", () => {
  it("parses note with tags array", () => {
    const dto = {
      relPath: "auth/jwt.md",
      title: "JWT",
      type: "note",
      importance: 5,
      tags: ["auth", "jwt"],
      epic: "",
      body: "# JWT\nbody",
      rels: [{ relationType: "links_to", target: "auth" }],
      backlinks: [],
      outgoing: [],
      isWorklog: false,
    };
    expect(noteSchema.parse(dto).tags).toEqual(["auth", "jwt"]);
  });

  it("rejects missing relPath", () => {
    expect(() => noteSchema.parse({ title: "x" })).toThrow();
  });
});
