import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { parseConfig } from "../../../src/core/Config.ts";
import { expandPath } from "../../../src/core/paths.ts";
import type { RawWorkspace } from "../../../src/core/Workspace.ts";
import type { Container } from "../../../src/platform/container.ts";
import { buildIndex } from "../../../src/retrieval/build.service.ts";
import { runHook } from "../../../src/session/hookRuntime.service.ts";
import { handleMemoryInject } from "../../../src/session/memoryInject.hook.ts";
import { parseMemoryInjectPayload } from "../../../src/session/payload.ts";
import {
  expandWorkspace,
  saveRegistry,
} from "../../../src/workspace/registry.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { type IoFake, makeIoFake } from "../../helpers/fakes/ioFake.fake.ts";

/**
 * `UserPromptSubmit`: gates in order (prompt length, salient-token count,
 * score floor). The `inject.jsonl` log is written before the emptiness
 * check, and is size-capped and rotated instead of growing unbounded.
 */

// SAFETY: fixed test fixtures, matching `tests/helpers/container.ts`'s
// DEFAULT_HOME/DEFAULT_CWD.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const CWD = "/home/test/project" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);
const CONFIG = parseConfig({});

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/home/test/vault-primary",
  worklogs: "/home/test/vault-primary/_Worklogs",
  exclude: ["_Worklogs"],
  // `dirname(":memory:")` -> `"/"` (`AbsPath.lastIndexOf("/")` is `-1`), so
  // `inject.jsonl` lands at the fake filesystem's root — harmless: `SqlDatabase` is
  // never faked (CLAUDE.md), so `indexDb` MUST stay `":memory:"` to avoid a
  // real on-disk SQLite file; `FileSystem` IS faked, so this path is still
  // just a key in `fsMemory.fake.ts`'s in-memory map, never real disk.
  indexDb: ":memory:",
};
// SAFETY: `PRIMARY.indexDb` is `":memory:"`, whose `parentDir` is the fixed
// literal `"/"` (see the comment above) — this is that same fixed literal
// path, not derived from any external input.
const INJECT_LOG_PATH = "/inject.jsonl" as AbsPath;

type Fixture = {
  readonly io: IoFake;
  readonly fs: ReturnType<typeof makeFsMemoryFake>;
  readonly container: Container;
};

function makeFixture(): Fixture {
  const io = makeIoFake();
  const fs = makeFsMemoryFake();
  const container = makeTestContainer({ stdio: io, fs });
  return { io, fs, container };
}

// BM25's IDF term collapses toward zero when a matching term appears in
// EVERY indexed document (as it would with only one note in the whole
// corpus) — a couple of unrelated filler notes are needed for the target
// note's match to clear the score floor at all, the same shape the fixture
// vault (`tests/fixtures/vault.ts`) uses for the same reason.
async function seedIndexedWorkspace(fixture: Fixture): Promise<void> {
  // SAFETY: a fixed literal path under `PRIMARY.kb`, a hard-coded test fixture.
  fixture.fs.seedFile(
    "/home/test/vault-primary/Injection Hook.md" as AbsPath,
    "---\ntype: note\nimportance: 6\n---\n# Injection Hook\n" +
      "The hook extracts salient tokens and keeps injecting them into the " +
      "prompt.\nWrap-gate blocking happens on Stop.\n",
  );
  // SAFETY: same reasoning as above.
  fixture.fs.seedFile(
    "/home/test/vault-primary/Orchard Trip.md" as AbsPath,
    "---\ntype: note\n---\n# Orchard Trip\nRed apples are quite tasty and " +
      "then much later i finally drove a car back home.\n",
  );
  // SAFETY: same reasoning as above.
  fixture.fs.seedFile(
    "/home/test/vault-primary/Fast Vehicle.md" as AbsPath,
    "---\ntype: note\n---\n# Fast Vehicle\nThe red car is very fast.\n",
  );
  await saveRegistry(fixture.fs, REGISTRY_PATH, [PRIMARY]);
  await buildIndex(fixture.container, expandWorkspace(PRIMARY, HOME));
}

async function runMemoryInject(fixture: Fixture, stdin: string): Promise<void> {
  fixture.io.setStdin(stdin);
  await runHook(
    fixture.container,
    CONFIG,
    "memory-inject",
    parseMemoryInjectPayload,
    handleMemoryInject,
  );
}

describe("UserPromptSubmit (memory-inject) hook", () => {
  test("happy path: injects the matching note and logs the candidate pool", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);

    await runMemoryInject(
      fixture,
      JSON.stringify({
        cwd: CWD,
        prompt: "tell me about the injection hook and wrap-gate blocking",
      }),
    );

    expect(fixture.io.written).toHaveLength(1);
    const rendered: {
      readonly hookSpecificOutput: {
        readonly hookEventName: string;
        readonly additionalContext: string;
      };
    } = JSON.parse(fixture.io.written[0] ?? "");
    expect(rendered.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(rendered.hookSpecificOutput.additionalContext).toContain(
      "Relevant memory (auto-retrieved from workspace `primary`",
    );
    expect(rendered.hookSpecificOutput.additionalContext).toContain("Injection Hook.md");
    expect(fixture.io.exitCode).toBe(0);

    const logLines = (await fixture.fs.readFile(INJECT_LOG_PATH)).trim().split("\n");
    expect(logLines).toHaveLength(1);
    const logRecord: {
      readonly ws: string;
      readonly cwd: string;
      readonly injected: { readonly notes: readonly string[] };
    } = JSON.parse(logLines[0] ?? "");
    expect(logRecord.ws).toBe("primary");
    expect(logRecord.cwd).toBe(CWD);
    expect(logRecord.injected.notes).toEqual(["Injection Hook.md"]);
  });

  test("a matching worklog entry is injected too, in its own bullet format", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);
    // SAFETY: fixed literal paths under `PRIMARY.worklogs`, hard-coded fixtures.
    fixture.fs.seedFile(
      "/home/test/vault-primary/_Worklogs/wt1/2026-01-01.md" as AbsPath,
      "## 10:00 — incident\n**Changes:** the injection hook dropped a wrap-gate " +
        "escalation during rollout.\n",
    );
    // SAFETY: same reasoning as above.
    fixture.fs.seedFile(
      "/home/test/vault-primary/_Worklogs/wt1/2026-01-02.md" as AbsPath,
      "## 09:00 — setup\n**Changes:** unrelated bootstrap notes about deploy " +
        "tooling.\n",
    );
    // SAFETY: same reasoning as above. A third, unrelated filler: with only
    // two worklog docs total, BM25's IDF term for a word shared by both
    // collapses toward zero the same way `seedIndexedWorkspace`'s own doc
    // comment explains for notes — a third filler is needed here too.
    fixture.fs.seedFile(
      "/home/test/vault-primary/_Worklogs/wt1/2026-01-03.md" as AbsPath,
      "## 08:00 — cleanup\n**Changes:** archived old build artifacts and logs.\n",
    );
    await buildIndex(fixture.container, expandWorkspace(PRIMARY, HOME));

    await runMemoryInject(
      fixture,
      JSON.stringify({
        cwd: CWD,
        prompt: "tell me about the injection hook and wrap-gate blocking",
      }),
    );

    const rendered: {
      readonly hookSpecificOutput: { readonly additionalContext: string };
    } = JSON.parse(fixture.io.written[0] ?? "");
    expect(rendered.hookSpecificOutput.additionalContext).toContain("_(worklog)_");
    expect(rendered.hookSpecificOutput.additionalContext).toContain("2026-01-01.md");

    const logRecord: {
      readonly injected: { readonly worklog: readonly string[] };
    } = JSON.parse((await fixture.fs.readFile(INJECT_LOG_PATH)).trim());
    expect(logRecord.injected.worklog).toEqual(["wt1/2026-01-01.md"]);
  });

  test("a search failure (index unreachable) returns silently, before any logging", async () => {
    const fixture = makeFixture();
    const brokenWorkspace: RawWorkspace = {
      ...PRIMARY,
      // A path under a directory that cannot exist: `bun:sqlite` throws
      // `SQLITE_CANTOPEN` opening it, synchronously, writing nothing —
      // `SqlDatabase` is still the real adapter (CLAUDE.md), just fed a path that
      // fails to open rather than a faked port.
      indexDb: "/definitely-not-a-real-directory-for-this-test/index.db",
    };
    await saveRegistry(fixture.fs, REGISTRY_PATH, [brokenWorkspace]);

    await runMemoryInject(
      fixture,
      JSON.stringify({
        cwd: CWD,
        prompt: "tell me about the injection hook and wrap-gate blocking",
      }),
    );

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(INJECT_LOG_PATH)).toBe(false);
  });

  test("prompt below the 12-char minimum: silent, no search, no log", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);

    await runMemoryInject(fixture, JSON.stringify({ cwd: CWD, prompt: "hi" }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(INJECT_LOG_PATH)).toBe(false);
  });

  test("fewer than 2 salient tokens: silent, no search, no log", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);
    // "are"/"you"/"the" are all stopwords (`retrieval/tokenize.ts`'s STOPWORDS);
    // only "one" survives — a single salient token, under MIN_TOKENS (2).
    await runMemoryInject(
      fixture,
      JSON.stringify({ cwd: CWD, prompt: "are you the one" }),
    );

    expect(fixture.io.written).toEqual([]);
    expect(await fixture.fs.exists(INJECT_LOG_PATH)).toBe(false);
  });

  test("cwd outside any workspace: silent, exit 0", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);

    await runMemoryInject(
      fixture,
      JSON.stringify({
        cwd: "/home/test/elsewhere",
        prompt: "tell me about kryptonite handbooks",
      }),
    );

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
  });

  test("missing prompt field: treated as empty, silent", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);

    await runMemoryInject(fixture, JSON.stringify({ cwd: CWD }));

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
  });

  test("off-topic prompt below the score floor: logged, but nothing injected", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);

    await runMemoryInject(
      fixture,
      JSON.stringify({ cwd: CWD, prompt: "quantum entanglement submarine engines" }),
    );

    // The pool is logged even when nothing injects.
    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
    expect(await fixture.fs.exists(INJECT_LOG_PATH)).toBe(true);
    const logRecord: { readonly injected: { readonly notes: readonly unknown[] } } =
      JSON.parse((await fixture.fs.readFile(INJECT_LOG_PATH)).trim());
    expect(logRecord.injected.notes).toEqual([]);
  });

  test("CCMEM_INJECT_LOG=0 disables logging entirely", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);
    const configLogDisabled = parseConfig({ CCMEM_INJECT_LOG: "0" });

    fixture.io.setStdin(
      JSON.stringify({
        cwd: CWD,
        prompt: "tell me about the injection hook and wrap-gate blocking",
      }),
    );
    await runHook(
      fixture.container,
      configLogDisabled,
      "memory-inject",
      parseMemoryInjectPayload,
      handleMemoryInject,
    );

    expect(fixture.io.written).toHaveLength(1); // injection itself is unaffected
    expect(await fixture.fs.exists(INJECT_LOG_PATH)).toBe(false);
  });

  test("inject.jsonl rotates instead of growing unbounded", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);
    const oneMebibyte = 1_048_576;
    const priorContent = "x".repeat(oneMebibyte);
    fixture.fs.seedFile(INJECT_LOG_PATH, priorContent);

    await runMemoryInject(
      fixture,
      JSON.stringify({
        cwd: CWD,
        prompt: "tell me about the injection hook and wrap-gate blocking",
      }),
    );

    // SAFETY: `INJECT_LOG_PATH` plus the fixed `.1` rotation suffix
    // `memoryInject.hook.ts`'s own rotation policy writes.
    const rotatedPath = "/inject.jsonl.1" as AbsPath;
    expect(await fixture.fs.exists(rotatedPath)).toBe(true);
    expect(await fixture.fs.readFile(rotatedPath)).toBe(priorContent);
    const currentContent = await fixture.fs.readFile(INJECT_LOG_PATH);
    expect(currentContent.length).toBeLessThan(oneMebibyte);
    expect(currentContent.trim().split("\n")).toHaveLength(1);
  });

  test("a second rotation pushes generation 1 into generation 2", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);
    const oneMebibyte = 1_048_576;
    // SAFETY: `INJECT_LOG_PATH` plus the fixed `.1` rotation suffix
    // `memoryInject.hook.ts`'s own rotation policy writes.
    const generationOnePath = "/inject.jsonl.1" as AbsPath;
    // SAFETY: same reasoning as above, the fixed `.2` suffix.
    const generationTwoPath = "/inject.jsonl.2" as AbsPath;
    const oldestContent = "already-rotated-once\n";
    fixture.fs.seedFile(generationOnePath, oldestContent);
    fixture.fs.seedFile(INJECT_LOG_PATH, "x".repeat(oneMebibyte));

    await runMemoryInject(
      fixture,
      JSON.stringify({
        cwd: CWD,
        prompt: "tell me about the injection hook and wrap-gate blocking",
      }),
    );

    // The PRE-EXISTING generation 1 (oldest kept) shifts to generation 2,
    // dropping anything that used to be there first.
    expect(await fixture.fs.readFile(generationTwoPath)).toBe(oldestContent);
    expect(await fixture.fs.readFile(generationOnePath)).toBe("x".repeat(oneMebibyte));
  });

  test("garbage stdin never throws: tolerant-parsed to an empty payload, silent", async () => {
    const fixture = makeFixture();
    await seedIndexedWorkspace(fixture);

    await runMemoryInject(fixture, "not json");

    expect(fixture.io.written).toEqual([]);
    expect(fixture.io.exitCode).toBe(0);
  });
});
