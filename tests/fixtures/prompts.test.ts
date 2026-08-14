/**
 * Unit tests for the prompt corpus loader — in particular the
 * PARITY_REAL_VAULT=1 real-prompt sampler, which self.test.ts never
 * exercises (it runs with the flag unset by design). Every real-vault read
 * here targets a FAKE `homeDirectory` under a temp dir, never the actual
 * `~/.claude` — see tests/fixtures/prompts.ts's own doc comment.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createTempDir } from "../helpers/tempdir.ts";
import { loadPromptCorpus, loadRealPrompts, SYNTHETIC_PROMPTS } from "./prompts.ts";

function writeFakeInjectLog(
  homeDirectory: string,
  workspaceId: string,
  lines: readonly string[],
): void {
  const dir = join(homeDirectory, ".claude", "memory", workspaceId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "inject.jsonl"), lines.join("\n") + "\n", "utf-8");
}

describe("loadRealPrompts", () => {
  test("returns [] when the fake home has no ~/.claude/memory at all", () => {
    const tempDir = createTempDir("prompts-empty-home");
    try {
      expect(loadRealPrompts(50, tempDir.path)).toEqual([]);
    } finally {
      tempDir.remove();
    }
  });

  test("extracts the prompt field from each JSONL row across workspaces", () => {
    const tempDir = createTempDir("prompts-real");
    try {
      writeFakeInjectLog(tempDir.path, "workspace-a", [
        '{"ts":"2026-01-01T00:00:00","ws":"workspace-a","prompt":"how does search_fused rank hits","tokens":[]}',
        '{"ts":"2026-01-01T00:00:01","ws":"workspace-a","prompt":"second real prompt here","tokens":[]}',
      ]);
      writeFakeInjectLog(tempDir.path, "workspace-b", [
        '{"ts":"2026-01-01T00:00:02","ws":"workspace-b","prompt":"a prompt from workspace b","tokens":[]}',
      ]);
      const prompts = loadRealPrompts(50, tempDir.path);
      expect(prompts).toContain("how does search_fused rank hits");
      expect(prompts).toContain("second real prompt here");
      expect(prompts).toContain("a prompt from workspace b");
    } finally {
      tempDir.remove();
    }
  });

  test("skips blank lines and rows with no prompt field, without throwing", () => {
    const tempDir = createTempDir("prompts-skip");
    try {
      writeFakeInjectLog(tempDir.path, "workspace-a", [
        "",
        '{"ts":"2026-01-01T00:00:00","ws":"workspace-a"}',
        "not json at all",
        '{"ts":"2026-01-01T00:00:01","ws":"workspace-a","prompt":"   "}',
        '{"ts":"2026-01-01T00:00:02","ws":"workspace-a","prompt":"a real one"}',
      ]);
      expect(loadRealPrompts(50, tempDir.path)).toEqual(["a real one"]);
    } finally {
      tempDir.remove();
    }
  });

  test("decodes JSON string escapes in the captured prompt text", () => {
    const tempDir = createTempDir("prompts-escapes");
    try {
      writeFakeInjectLog(tempDir.path, "workspace-a", [
        String.raw`{"ts":"2026-01-01T00:00:00","prompt":"line one\nline two \"quoted\""}`,
      ]);
      expect(loadRealPrompts(50, tempDir.path)).toEqual(['line one\nline two "quoted"']);
    } finally {
      tempDir.remove();
    }
  });

  test("stops sampling once sampleSize is reached", () => {
    const tempDir = createTempDir("prompts-limit");
    try {
      writeFakeInjectLog(tempDir.path, "workspace-a", [
        '{"prompt":"first"}',
        '{"prompt":"second"}',
        '{"prompt":"third"}',
      ]);
      expect(loadRealPrompts(2, tempDir.path)).toHaveLength(2);
    } finally {
      tempDir.remove();
    }
  });

  test("skips a workspace directory whose inject.jsonl does not exist", () => {
    const tempDir = createTempDir("prompts-missing-log");
    try {
      mkdirSync(join(tempDir.path, ".claude", "memory", "empty-workspace"), {
        recursive: true,
      });
      expect(loadRealPrompts(50, tempDir.path)).toEqual([]);
    } finally {
      tempDir.remove();
    }
  });
});

describe("loadPromptCorpus", () => {
  test("returns exactly the synthetic corpus when PARITY_REAL_VAULT is unset", () => {
    const previous = process.env["PARITY_REAL_VAULT"];
    delete process.env["PARITY_REAL_VAULT"];
    try {
      expect(loadPromptCorpus()).toEqual(SYNTHETIC_PROMPTS);
    } finally {
      if (previous !== undefined) process.env["PARITY_REAL_VAULT"] = previous;
    }
  });

  test("widens the corpus with real prompts from THIS machine when PARITY_REAL_VAULT=1", () => {
    // Exercises the opt-in branch itself; whatever this machine's real
    // ~/.claude/memory holds (if anything) only ever gets READ, and only to
    // build a list of strings — never written to, never replayed against
    // anything but the synthetic fixture vault.
    const previous = process.env["PARITY_REAL_VAULT"];
    process.env["PARITY_REAL_VAULT"] = "1";
    try {
      const corpus = loadPromptCorpus();
      for (const prompt of SYNTHETIC_PROMPTS) {
        expect(corpus).toContain(prompt);
      }
      expect(corpus.length).toBeGreaterThanOrEqual(SYNTHETIC_PROMPTS.length);
    } finally {
      if (previous === undefined) delete process.env["PARITY_REAL_VAULT"];
      else process.env["PARITY_REAL_VAULT"] = previous;
    }
  });
});
