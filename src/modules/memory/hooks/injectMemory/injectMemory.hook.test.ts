import { describe, expect, test } from "bun:test";

import { registerHooks } from "@/core/index.ts";
import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { HookName, HookResultKind } from "@/core/index.ts";
import { SearchIndexFake } from "@/gateways/index.ts";
import { InjectMemoryHookResolver } from "@/modules/memory/hooks/injectMemory/injectMemory.hook.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const WORKSPACE: Workspace = {
  id: "primary",
  match: [absPath("/home/test/project")],
  kb: absPath("/home/test/vault-primary"),
  worklogs: absPath("/home/test/vault-primary/_Worklogs"),
  exclude: ["_Worklogs"],
  indexDb: absPath("/mem/index.db"),
  matchedPrefix: absPath("/home/test/project"),
};
const CWD = absPath("/home/test/project");
const INJECT_LOG_PATH = absPath("/mem/inject.jsonl");

const PROMPT = "tell me about the injection hook and wrap-gate blocking";

function makeHandler(fs = makeFsMemoryFake(), index = new SearchIndexFake()) {
  const ctx = makeAppContext({ fs }, index);
  const [handler] = registerHooks([InjectMemoryHookResolver], ctx);
  if (handler === undefined) throw new Error("expected one hook handler");
  return { handler, ctx, fs, index };
}

describe("memory-inject hook", () => {
  test("registers under the memory-inject name", () => {
    const { handler } = makeHandler();
    expect(handler.name).toBe(HookName.MemoryInject);
  });

  test("injects a matching note and logs the candidate pool", async () => {
    const index = new SearchIndexFake();
    index.setNextHits([
      {
        path: absPath("/home/test/vault-primary/Injection Hook.md"),
        title: "Injection Hook",
        snippet: "the hook extracts salient tokens",
        score: -1,
      },
    ]);
    index.setNextInlinks(new Map());
    const { handler, fs } = makeHandler(makeFsMemoryFake(), index);

    const result = await handler.handle({ prompt: PROMPT }, WORKSPACE, CWD);

    expect(result.kind).toBe(HookResultKind.Context);
    if (result.kind !== HookResultKind.Context) return;
    expect(result.text).toContain("Relevant memory (auto-retrieved from workspace");
    expect(result.text).toContain("Injection Hook.md");

    const logLines = (await fs.readFile(INJECT_LOG_PATH)).trim().split("\n");
    expect(logLines).toHaveLength(1);
    const record: {
      readonly ws: string;
      readonly injected: { readonly notes: readonly string[] };
    } = JSON.parse(logLines[0] ?? "");
    expect(record.ws).toBe("primary");
    expect(record.injected.notes).toEqual(["Injection Hook.md"]);
  });

  test("a prompt below the minimum length is silent, with no search or log", async () => {
    const { handler, fs } = makeHandler();

    const result = await handler.handle({ prompt: "hi" }, WORKSPACE, CWD);

    expect(result.kind).toBe(HookResultKind.Silent);
    expect(await fs.exists(INJECT_LOG_PATH)).toBe(false);
  });

  test("hits below the score floor are logged but not injected", async () => {
    const index = new SearchIndexFake();
    index.setNextHits([
      {
        path: absPath("/home/test/vault-primary/Weak.md"),
        title: "Weak",
        snippet: "…",
        score: -0.1,
      },
    ]);
    index.setNextInlinks(new Map());
    const { handler, fs } = makeHandler(makeFsMemoryFake(), index);

    const result = await handler.handle({ prompt: PROMPT }, WORKSPACE, CWD);

    expect(result.kind).toBe(HookResultKind.Silent);
    const record: { readonly injected: { readonly notes: readonly string[] } } =
      JSON.parse((await fs.readFile(INJECT_LOG_PATH)).trim());
    expect(record.injected.notes).toEqual([]);
  });
});
