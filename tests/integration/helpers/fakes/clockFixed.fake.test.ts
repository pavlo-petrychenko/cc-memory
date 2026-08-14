import { describe, expect, test } from "bun:test";

import { makeClockFake } from "../../../helpers/fakes/clockFixed.fake.ts";

describe("clockFake", () => {
  test("defaults to the given (or zero-value) initial readings", () => {
    const clock = makeClockFake();

    expect(clock.nowMs()).toBe(0);
    expect(clock.today()).toBe("2026-01-01");
    expect(clock.timeHHMM()).toBe("00:00");
  });

  test("constructor arguments seed the initial readings", () => {
    const clock = makeClockFake(1000, "2026-08-14", "13:37");

    expect(clock.nowMs()).toBe(1000);
    expect(clock.today()).toBe("2026-08-14");
    expect(clock.timeHHMM()).toBe("13:37");
  });

  test("setNowMs overrides nowMs without touching today/timeHHMM", () => {
    const clock = makeClockFake(0, "2026-01-01", "00:00");

    clock.setNowMs(5000);

    expect(clock.nowMs()).toBe(5000);
    expect(clock.today()).toBe("2026-01-01");
  });

  test("advanceMs moves nowMs forward relative to its current value", () => {
    const clock = makeClockFake(1000);

    clock.advanceMs(500);
    clock.advanceMs(500);

    expect(clock.nowMs()).toBe(2000);
  });

  test("setToday and setTimeHHMM override independently of nowMs", () => {
    const clock = makeClockFake();

    clock.setToday("2030-12-31");
    clock.setTimeHHMM("23:59");

    expect(clock.today()).toBe("2030-12-31");
    expect(clock.timeHHMM()).toBe("23:59");
    expect(clock.nowMs()).toBe(0);
  });
});
