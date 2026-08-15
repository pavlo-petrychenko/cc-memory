import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { PayloadParser } from "@/session/payload/payload.parser.ts";
import { HookResultSerializer } from "@/session/runtime/hookResult.serializer.ts";
import { HookRuntimeService } from "@/session/runtime/runtime.service.ts";
import type { HookHandler } from "@/session/runtime/runtime.typedefs.ts";
import { HookResultKind } from "@/session/session.typedefs.ts";
import type { HookResult } from "@/session/session.typedefs.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeLoggerFake } from "@/testing/fakes/loggerCollect.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { RegistryService, RegistryTomlSerializer } from "@/workspace/index.ts";

/**
 * `HookRuntimeService.run`'s own shared preamble/postamble — the piece
 * exercised only INDIRECTLY by the 5 per-event contract test files (each of
 * which only ever hands it a handler that behaves, so its own top-level
 * `catch` never fires in any of them). This file targets that seam
 * directly: an exception that escapes the handler must be logged and still
 * end in exit(0), never a thrown error or a non-zero exit — the literal
 * fail-open invariant.
 */

// SAFETY: fixed test fixtures, matching `testContainer.fixture.ts`'s
// DEFAULT_HOME/DEFAULT_CWD.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const CWD = "/home/test/project" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/home/test/project"],
  kb: "/home/test/vault-primary",
  worklogs: "/home/test/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

type SessionStartLikePayload = { readonly cwd: string | null };

function toHandler(
  handle: HookHandler<SessionStartLikePayload>["handle"],
): HookHandler<SessionStartLikePayload> {
  return { handle };
}

describe("HookRuntimeService.run (the shared per-hook preamble/postamble)", () => {
  test("an exception thrown by the handler is logged and still exits 0, no crash", async () => {
    const io = makeIoFake();
    const fs = makeFsMemoryFake();
    const logger = makeLoggerFake();
    const container = makeTestContainer({ stdio: io, fs, logger });
    const payloadParser = new PayloadParser();
    const hookRuntimeService = new HookRuntimeService(
      container,
      payloadParser,
      new HookResultSerializer(),
    );
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);
    io.setStdin(JSON.stringify({ cwd: CWD }));

    await hookRuntimeService.run(
      "boom-hook",
      (record) => payloadParser.parseSessionStart(record),
      toHandler(() => {
        throw new Error("deliberate handler failure");
      }),
    );

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
    const payloadParser = new PayloadParser();
    const hookRuntimeService = new HookRuntimeService(
      container,
      payloadParser,
      new HookResultSerializer(),
    );
    await new RegistryService(fs, new RegistryTomlSerializer()).save(REGISTRY_PATH, [
      PRIMARY,
    ]);
    io.setStdin(JSON.stringify({ cwd: CWD }));

    await hookRuntimeService.run(
      "boom-hook",
      (record) => payloadParser.parseSessionStart(record),
      toHandler(async () => {
        throw new Error("deliberate async failure");
      }),
    );

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.length).toBeGreaterThan(0);
  });

  test("no resolved workspace never calls the handler at all: silent, exit 0", async () => {
    const io = makeIoFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, fs });
    const payloadParser = new PayloadParser();
    const hookRuntimeService = new HookRuntimeService(
      container,
      payloadParser,
      new HookResultSerializer(),
    );
    // No registry saved at all — no workspace can ever resolve.
    io.setStdin(JSON.stringify({ cwd: CWD }));
    let handlerCalled = false;

    await hookRuntimeService.run(
      "unreached-hook",
      (record) => payloadParser.parseSessionStart(record),
      toHandler(async (): Promise<HookResult> => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      }),
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
    const payloadParser = new PayloadParser();
    const hookRuntimeService = new HookRuntimeService(
      container,
      payloadParser,
      new HookResultSerializer(),
    );
    fs.seedFile(REGISTRY_PATH, "this is not [valid toml");
    io.setStdin(JSON.stringify({ cwd: CWD }));

    await hookRuntimeService.run(
      "any-hook",
      (record) => payloadParser.parseSessionStart(record),
      toHandler(async (): Promise<HookResult> => ({ kind: HookResultKind.Silent })),
    );

    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.length).toBeGreaterThan(0);
  });
});
