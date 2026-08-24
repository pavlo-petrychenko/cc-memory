import { describe, expect, test } from "bun:test";

import { ToggleMemoryUseCase } from "@/modules/sessionToggle/useCases/toggleMemory.useCase.ts";
import type { EnvFake } from "@/testing/fakes/envMap.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const SESSION = "fc61f191-df21-457b-98ca-a1e8158486c5";

function makeUseCase(envSessionId: string | null) {
  const ctx = makeAppContext();
  // SAFETY: makeAppContext wires an EnvFake as the env gateway; the assertion
  // only recovers its `set` helper for the test.
  const env = ctx.gateways.env as EnvFake;
  if (envSessionId !== null) env.set("CLAUDE_CODE_SESSION_ID", envSessionId);
  return new ToggleMemoryUseCase(ctx);
}

describe("ToggleMemoryUseCase", () => {
  test("off/on/status report lines for the env-provided session", async () => {
    const useCase = makeUseCase(SESSION);

    expect(await useCase.execute({ action: "off", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory off for session ${SESSION}`],
    });
    expect(await useCase.execute({ action: "status", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory is off for session ${SESSION}`],
    });
    expect(await useCase.execute({ action: "on", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory on for session ${SESSION}`],
    });
    expect(await useCase.execute({ action: "status", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory is on for session ${SESSION}`],
    });
  });

  test("an explicit --session overrides the environment variable", async () => {
    const useCase = makeUseCase(SESSION);
    const other = "ba0f5d39-bbb8-4dc9-b243-63581b81ec16";

    const result = await useCase.execute({ action: "off", explicitSessionId: other });
    expect(result).toEqual({ ok: true, value: [`cc-memory off for session ${other}`] });

    // The env session was never touched.
    expect(await useCase.execute({ action: "status", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory is on for session ${SESSION}`],
    });
  });

  test("flip alternates off and on", async () => {
    const useCase = makeUseCase(SESSION);
    expect(await useCase.execute({ action: "flip", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory off for session ${SESSION}`],
    });
    expect(await useCase.execute({ action: "flip", explicitSessionId: null })).toEqual({
      ok: true,
      value: [`cc-memory on for session ${SESSION}`],
    });
  });

  test("no session id anywhere fails with a remedy-naming error", async () => {
    const useCase = makeUseCase(null);
    const result = await useCase.execute({ action: "off", explicitSessionId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("--session");
      expect(result.error).toContain("CLAUDE_CODE_SESSION_ID");
    }
  });

  test("an unsafe explicit id is refused, not written", async () => {
    const useCase = makeUseCase(SESSION);
    const result = await useCase.execute({
      action: "off",
      explicitSessionId: "../../escape",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unsafe session id");
  });
});
