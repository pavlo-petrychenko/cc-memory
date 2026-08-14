import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../core/AbsPath.ts";
import { parseConfig } from "../core/Config.ts";
import { expandPath } from "../core/paths.ts";
import type { RawWorkspace } from "../core/Workspace.ts";
import { makeFsMemoryFake } from "../testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "../testing/fakes/ioFake.fake.ts";
import { makeLoggerFake } from "../testing/fakes/loggerCollect.fake.ts";
import { makeTestContainer } from "../testing/fixtures/testContainer.fixture.ts";
import { saveRegistry } from "../workspace/registry.service.ts";
import { HookResultKind } from "./HookResult.ts";
import { runHook } from "./hookRuntime.service.ts";
import { parseSessionStartPayload } from "./payload.ts";

/**
 * `runHook`'s own shared preamble/postamble — the piece exercised only
 * INDIRECTLY by the 5 per-event contract test files (each of which only ever
 * hands it a handler that behaves, so its own top-level `catch` never fires
 * in any of them). This file targets that seam directly: an exception that
 * escapes the handler must be logged and still end in exit(0), never a
 * thrown error or a non-zero exit — the literal fail-open invariant.
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
  exclude: [],
  indexDb: ":memory:",
};

describe("runHook (the shared per-hook preamble/postamble)", () => {
  test("an exception thrown by the handler is logged and still exits 0, no crash", async () => {
    const io = makeIoFake();
    const fs = makeFsMemoryFake();
    const logger = makeLoggerFake();
    const container = makeTestContainer({ stdio: io, fs, logger });
    await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
    io.setStdin(JSON.stringify({ cwd: CWD }));

    await runHook(container, CONFIG, "boom-hook", parseSessionStartPayload, () => {
      throw new Error("deliberate handler failure");
    });

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.some((entry) => entry.message.includes("boom-hook"))).toBe(
      true,
    );
    expect(
      logger.entries.some((entry) =>
        entry.message.includes("deliberate handler failure"),
      ),
    ).toBe(true);
  });

  test("a rejected handler promise is also caught, logged, and exits 0", async () => {
    const io = makeIoFake();
    const fs = makeFsMemoryFake();
    const logger = makeLoggerFake();
    const container = makeTestContainer({ stdio: io, fs, logger });
    await saveRegistry(fs, REGISTRY_PATH, [PRIMARY]);
    io.setStdin(JSON.stringify({ cwd: CWD }));

    await runHook(container, CONFIG, "boom-hook", parseSessionStartPayload, async () => {
      throw new Error("deliberate async failure");
    });

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.length).toBeGreaterThan(0);
  });

  test("no resolved workspace never calls the handler at all: silent, exit 0", async () => {
    const io = makeIoFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, fs });
    // No registry saved at all — no workspace can ever resolve.
    io.setStdin(JSON.stringify({ cwd: CWD }));
    let handlerCalled = false;

    await runHook(
      container,
      CONFIG,
      "unreached-hook",
      parseSessionStartPayload,
      async () => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      },
    );

    expect(handlerCalled).toBe(false);
    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
  });

  test("a malformed (present, unparsable) registry is treated as no workspace, and logged", async () => {
    const io = makeIoFake();
    const fs = makeFsMemoryFake();
    const logger = makeLoggerFake();
    const container = makeTestContainer({ stdio: io, fs, logger });
    fs.seedFile(REGISTRY_PATH, "this is not [valid toml");
    io.setStdin(JSON.stringify({ cwd: CWD }));

    await runHook(container, CONFIG, "any-hook", parseSessionStartPayload, async () => ({
      kind: HookResultKind.Silent,
    }));

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.length).toBeGreaterThan(0);
  });
});
