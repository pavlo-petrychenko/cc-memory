/**
 * Unit tests for the temp-dir + snapshot helpers underlying the parity
 * differ's file-tree comparison. self.test.ts only ever snapshots the
 * fixture's own (non-binary, non-`.git`) content indirectly through real
 * Python runs, so the binary-detection and missing-root branches here get
 * their own direct coverage.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, snapshotTree } from "./tempdir.ts";

describe("createTempDir", () => {
  test("creates a real, empty, removable directory", () => {
    const tempDir = createTempDir("tempdir-unit");
    try {
      expect(snapshotTree(tempDir.path)).toEqual([]);
    } finally {
      tempDir.remove();
    }
    expect(snapshotTree(tempDir.path)).toEqual([]); // removed root -> empty, not a throw
  });
});

describe("snapshotTree", () => {
  test("returns [] for a root that does not exist at all", () => {
    expect(snapshotTree("/no/such/path/at/all")).toEqual([]);
  });

  test("returns text file contents, sorted by relative path", () => {
    const tempDir = createTempDir("tempdir-text");
    try {
      writeFileSync(join(tempDir.path, "b.md"), "second", "utf-8");
      mkdirSync(join(tempDir.path, "Alpha"), { recursive: true });
      writeFileSync(join(tempDir.path, "Alpha", "a.md"), "first", "utf-8");
      expect(snapshotTree(tempDir.path)).toEqual([
        { relativePath: "Alpha/a.md", contents: "first" },
        { relativePath: "b.md", contents: "second" },
      ]);
    } finally {
      tempDir.remove();
    }
  });

  test("records a `.git` directory as one placeholder entry, without recursing into it", () => {
    const tempDir = createTempDir("tempdir-git");
    try {
      mkdirSync(join(tempDir.path, ".git", "objects", "ab"), { recursive: true });
      writeFileSync(
        join(tempDir.path, ".git", "objects", "ab", "cdef"),
        "loose object bytes",
        "utf-8",
      );
      expect(snapshotTree(tempDir.path)).toEqual([
        { relativePath: ".git", contents: "<git repo>" },
      ]);
    } finally {
      tempDir.remove();
    }
  });

  test("masks a known-volatile basename (index.db) instead of reading its bytes", () => {
    const tempDir = createTempDir("tempdir-volatile");
    try {
      writeFileSync(join(tempDir.path, "index.db"), Buffer.from([0, 1, 2, 3]));
      expect(snapshotTree(tempDir.path)).toEqual([
        { relativePath: "index.db", contents: "<derived:index.db>" },
      ]);
    } finally {
      tempDir.remove();
    }
  });

  test("replaces a genuinely binary file's bytes with a size placeholder", () => {
    const tempDir = createTempDir("tempdir-binary");
    try {
      const bytes = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      writeFileSync(join(tempDir.path, "blob.bin"), bytes);
      expect(snapshotTree(tempDir.path)).toEqual([
        { relativePath: "blob.bin", contents: `<binary:${bytes.byteLength} bytes>` },
      ]);
    } finally {
      tempDir.remove();
    }
  });
});
