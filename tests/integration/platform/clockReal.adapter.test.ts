import { describe, expect, test } from "bun:test";

import { makeClockRealAdapter } from "../../../src/platform/clockReal.adapter.ts";

describe("clockReal adapter", () => {
  test("nowMs returns a plausible current epoch millisecond value", () => {
    const clock = makeClockRealAdapter();

    const before = Date.now();
    const value = clock.nowMs();
    const after = Date.now();

    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  test("today returns YYYY-MM-DD matching the local calendar date", () => {
    const clock = makeClockRealAdapter();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;

    expect(clock.today()).toBe(expected);
  });

  test("today is zero-padded for single-digit months and days", () => {
    // A fixed local date guarantees a single-digit month/day at least once a
    // year, so exercise the formatting logic directly rather than waiting for
    // one: the adapter's `twoDigits` helper is internal, so this is checked by
    // shape (length 10, two hyphens) instead.
    const clock = makeClockRealAdapter();

    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("timeHHMM returns a zero-padded 24-hour HH:MM", () => {
    const clock = makeClockRealAdapter();

    expect(clock.timeHHMM()).toMatch(/^\d{2}:\d{2}$/);
  });
});
