import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { KbMapFormatter, KbMapService, NoteParser } from "@/knowledge/index.ts";
import type { Container } from "@/platform/index.ts";
import {
  IndexBuildService,
  IndexConnectionService,
  SchemaService,
} from "@/retrieval/index.ts";
import { SessionStartHook } from "@/session/hooks/sessionStart/sessionStart.hook.ts";
import { PayloadParser } from "@/session/payload/payload.parser.ts";
import { HookResultSerializer } from "@/session/runtime/hookResult.serializer.ts";
import { HookRuntimeService } from "@/session/runtime/runtime.service.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { type IoFake, makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { WorkingMemoryFormatter, WorklogStoreService } from "@/worklog/index.ts";
import { RegistryService, RegistryTomlSerializer } from "@/workspace/index.ts";

/**
 * `SessionStart`: happy path (exact stdout string), cwd outside any
 * workspace, and the fields another hook reads but this one ignores
 * (`session_id`, `source`, `stop_hook_active`).
 */

// SAFETY: `"/home/test"` is a fixed test fixture (matching
// `testContainer.fixture.ts`'s DEFAULT_HOME), not user input — no leading
// `~` or relative segment to normalize.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above — a fixed test fixture, matching
// `testContainer.fixture.ts`'s DEFAULT_CWD.
const CWD = "/home/test/project" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/home/test/vault-primary",
  worklogs: "/home/test/vault-primary/_Worklogs",
  exclude: ["_Worklogs"],
  indexDb: ":memory:",
};

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

async function runSessionStart(
  container: Container,
  io: IoFake,
  stdin: string,
): Promise<void> {
  io.setStdin(stdin);
  const payloadParser = new PayloadParser();
  const hookRuntimeService = new HookRuntimeService(
    container,
    payloadParser,
    new HookResultSerializer(),
  );
  await hookRuntimeService.run(
    "session-start",
    (record) => payloadParser.parseSessionStart(record),
    new SessionStartHook(
      container,
      new IndexBuildService(new IndexConnectionService(new SchemaService())),
      new KbMapService(container.fs, new NoteParser()),
      new KbMapFormatter(),
      new WorklogStoreService(container.fs, container.git),
      new WorkingMemoryFormatter(),
    ),
  );
}

type RenderedContext = {
  readonly hookSpecificOutput: {
    readonly hookEventName: string;
    readonly additionalContext: string;
  };
};

describe("SessionStart hook", () => {
  test("happy path: KB map + working memory, joined by a horizontal rule", async () => {
    const { io, fs, container } = makeFixture();
    // SAFETY: a fixed literal path joined onto a fixed literal directory
    // string, both hard-coded test fixtures.
    fs.seedFile(
      "/home/test/vault-primary/Alpha/Alpha.md" as AbsPath,
      "---\ntype: index\n---\n# Alpha\n> Index for the Alpha feature.\n",
    );
    // SAFETY: same reasoning as above. `_root`, not `wt1`: `GitFake`'s
    // `showToplevel` returns `""` by default (unset), so `worktreeSlug` falls
    // back to `cwd` itself; `CWD` equals `PRIMARY`'s only `match` entry
    // exactly, so the path relative to the matched prefix is empty.
    fs.seedFile(
      "/home/test/vault-primary/_Worklogs/_root/STATE.md" as AbsPath,
      "# wt1\n## Current focus\nnothing\n",
    );
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);

    await runSessionStart(
      container,
      io,
      JSON.stringify({ cwd: CWD, session_id: "s1", source: "startup" }),
    );

    expect(io.written).toHaveLength(1);
    const rendered: RenderedContext = JSON.parse(io.written[0] ?? "");
    expect(rendered.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(rendered.hookSpecificOutput.additionalContext).toBe(
      "# Obsidian KB index (auto-injected at session start)\n\n" +
        "Top level of the vault at `~/vault-primary`. This is the map only — " +
        "when a topic below matches your task, open that folder's notes via " +
        "the `obsidian` MCP and follow the wikilinks. Capture new durable, " +
        "feature-level knowledge with the `save-learning` skill (writes need " +
        "approval).\n\n## Features\n- **Alpha** — Index for the Alpha feature." +
        "\n\n---\n\n# Working memory — workspace `primary`, worktree `_root`" +
        "\n\n# wt1\n## Current focus\nnothing" +
        "\n\n_(Update this at wrap with the `remember` skill.)_",
    );
    expect(io.exitCode).toBe(0);
  });

  test("cwd outside any workspace: silent, no output, exit 0", async () => {
    const { io, fs, container } = makeFixture();
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);

    await runSessionStart(
      container,
      io,
      JSON.stringify({ cwd: "/home/test/elsewhere", session_id: "s1" }),
    );

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
  });

  test("missing fields (empty payload) falls back to the process cwd", async () => {
    const { io, fs, container } = makeFixture();
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);
    // `Env` fake defaults its `cwd()` to the same `/home/test/project` used
    // above as `PRIMARY`'s match prefix — see `testContainer.fixture.ts`.

    await runSessionStart(container, io, "{}");

    expect(io.written).toHaveLength(1);
    expect(io.exitCode).toBe(0);
  });

  test("stop_hook_active is a foreign field this hook never reads: ignored", async () => {
    const { io, fs, container } = makeFixture();
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);

    await runSessionStart(
      container,
      io,
      JSON.stringify({ cwd: CWD, session_id: "s1", stop_hook_active: true }),
    );

    expect(io.written).toHaveLength(1);
    expect(io.exitCode).toBe(0);
  });

  test("vault directory missing: working memory only, no KB map section", async () => {
    const { io, fs, container } = makeFixture();
    // No `/vault-primary` directory seeded at all.
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);

    await runSessionStart(container, io, JSON.stringify({ cwd: CWD }));

    expect(io.written).toHaveLength(1);
    const rendered: {
      readonly hookSpecificOutput: { readonly additionalContext: string };
    } = JSON.parse(io.written[0] ?? "");
    expect(rendered.hookSpecificOutput.additionalContext).not.toContain(
      "Obsidian KB index",
    );
    expect(rendered.hookSpecificOutput.additionalContext).toContain(
      "No working memory yet for this worktree",
    );
  });

  test("a registry that fails to load resolves no workspace: silent, exit 0", async () => {
    const { io, fs, container } = makeFixture();
    // Present but unparsable TOML (`RegistryErrorKind.ParseError`).
    fs.seedFile(REGISTRY_PATH, "this is not [valid toml");

    await runSessionStart(container, io, JSON.stringify({ cwd: CWD }));

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
  });

  test("garbage stdin never throws: tolerant-parsed to an empty payload", async () => {
    const { io, fs, container } = makeFixture();
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);

    await runSessionStart(container, io, "not json");

    // Falls back to the process cwd, same as the empty-payload case above.
    expect(io.written).toHaveLength(1);
    expect(io.exitCode).toBe(0);
  });
});
