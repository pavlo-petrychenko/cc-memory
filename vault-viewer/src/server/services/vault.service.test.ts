import { describe, expect, it } from "vitest";

import { MemoryFileSystem } from "../gateways/fs.gateway.js";
import { VaultService } from "./vault.service.js";

describe("VaultService.walkKb with MemoryFs", () => {
  it("walks and parses notes", async () => {
    const fs = new MemoryFileSystem({
      "kb/a.md": "---\ntype: note\n---\n# Hello\nbody [[Link]]",
      "kb/b/c.md": "# World\n#tag",
      "kb/_Worklogs/ignore.md": "# Ignore",
    });
    const svc = new VaultService(fs);
    const notes = await svc.walkKb("kb", ["_Worklogs"]);
    expect(notes.map((n) => n.relPath).sort()).toEqual(["a.md", "b/c.md"]);
    expect(notes.find((n) => n.relPath === "a.md")?.title).toBe("Hello");
  });

  it("excludes dirs", async () => {
    const fs = new MemoryFileSystem({
      "kb/keep/a.md": "# A",
      "kb/exclude/b.md": "# B",
    });
    const svc = new VaultService(fs);
    const notes = await svc.walkKb("kb", ["exclude"]);
    expect(notes.map((n) => n.relPath)).toEqual(["keep/a.md"]);
  });

  it("scanWorklogs finds STATE and entries", async () => {
    const fs = new MemoryFileSystem({
      "wl/_root/STATE.md": "# State",
      "wl/_root/2026-08-20.md": "# Entry",
      "wl/feat-x/STATE.md": "# Feat",
    });
    const svc = new VaultService(fs);
    const slugs = await svc.scanWorklogs("wl");
    expect(slugs.map((s) => s.slug).sort()).toEqual(["_root", "feat-x"]);
    expect(slugs.find((s) => s.slug === "_root")?.stateExists).toBe(true);
    expect(slugs.find((s) => s.slug === "_root")?.entries).toHaveLength(1);
  });
});
