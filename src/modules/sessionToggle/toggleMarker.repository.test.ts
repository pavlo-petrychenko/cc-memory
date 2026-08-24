import { describe, expect, test } from "bun:test";

import { absPath, expandPath, joinAbs } from "@/core/index.ts";
import { SessionToggleState } from "@/core/index.ts";
import {
  MARKER_MAX_AGE_MS,
  TOGGLES_DIR_HOME_RELATIVE_PATH,
} from "@/modules/sessionToggle/sessionToggle.constants.ts";
import { markerFileName } from "@/modules/sessionToggle/sessionToggle.utils.ts";
import { ToggleMarkerRepository } from "@/modules/sessionToggle/toggleMarker.repository.ts";
import type { ClockFake } from "@/testing/fakes/clockFixed.fake.ts";
import type { EnvFake } from "@/testing/fakes/envMap.fake.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const HOME = absPath("/home/test");
const SESSION = "9e031b73-2bfa-4d04-b1dd-46d56eaa2b13";

function togglesDir(): ReturnType<typeof expandPath> {
  return expandPath(TOGGLES_DIR_HOME_RELATIVE_PATH, HOME);
}

function markerPath(sessionId: string): ReturnType<typeof expandPath> {
  return joinAbs(togglesDir(), markerFileName(sessionId));
}

function makeRepo() {
  const ctx = makeAppContext();
  // SAFETY: makeTestGateways wires an FsMemoryFake; this recovers seedFile.
  const fs = ctx.gateways.fs as ReturnType<typeof makeFsMemoryFake>;
  // SAFETY: makeTestGateways wires an EnvFake; this recovers its test helpers.
  const env = ctx.gateways.env as EnvFake;
  // SAFETY: makeTestGateways wires a ClockFake; this recovers setNowMs.
  const clock = ctx.gateways.clock as ClockFake;
  return { repo: new ToggleMarkerRepository(ctx), fs, env, clock };
}

describe("ToggleMarkerRepository", () => {
  test("disable writes a marker under ~/.claude/memory/toggles and stateFor reports Disabled", async () => {
    const { repo, fs } = makeRepo();
    expect(await repo.stateFor(SESSION)).toBe(SessionToggleState.Enabled);

    await repo.disable(SESSION);
    expect(await fs.exists(markerPath(SESSION))).toBe(true);
    expect(await repo.stateFor(SESSION)).toBe(SessionToggleState.Disabled);
  });

  test("enable removes the marker again", async () => {
    const { repo } = makeRepo();
    await repo.disable(SESSION);
    await repo.enable(SESSION);
    expect(await repo.stateFor(SESSION)).toBe(SessionToggleState.Enabled);
  });

  test("enabling a session that was never disabled is idempotent", async () => {
    const { repo } = makeRepo();
    await repo.enable(SESSION);
    expect(await repo.stateFor(SESSION)).toBe(SessionToggleState.Enabled);
  });

  test("unsafe session ids never touch the filesystem", async () => {
    const { repo, fs } = makeRepo();
    await expect(repo.disable("../escape")).rejects.toThrow("unsafe session id");
    await expect(repo.enable("a/b")).rejects.toThrow("unsafe session id");
    expect(await repo.stateFor("../escape")).toBe(SessionToggleState.Enabled);
    expect(await fs.exists(togglesDir())).toBe(false);
  });

  test("markers older than 24h are swept by the next operation; fresh ones survive", async () => {
    const { repo, fs, clock } = makeRepo();
    const staleId = "stale-session-id";
    const freshId = "fresh-session-id";
    const nowMs = MARKER_MAX_AGE_MS + 5;
    clock.setNowMs(nowMs);
    // SAFETY: fixed literal fixture paths built from the same constants the
    // repository uses.
    fs.seedFile(markerPath(staleId), "", 0);
    fs.seedFile(markerPath(freshId), "", nowMs);

    expect(await repo.stateFor(SESSION)).toBe(SessionToggleState.Enabled);

    expect(await fs.exists(markerPath(staleId))).toBe(false);
    expect(await fs.exists(markerPath(freshId))).toBe(true);
  });
});
