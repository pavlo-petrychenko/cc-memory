import type { Clock } from "../../../src/platform/clock.port.ts";

export type ClockFake = Clock & {
  readonly setNowMs: (value: number) => void;
  readonly advanceMs: (deltaMs: number) => void;
  readonly setToday: (value: string) => void;
  readonly setTimeHHMM: (value: string) => void;
};

/**
 * A `Clock` a test fully controls — `today`/`timeHHMM` are settable
 * independently of `nowMs` (rather than derived from it) so a test doesn't
 * have to fight the host machine's timezone to get a deterministic date/time
 * string; `nowMs` is what incremental-index tests advance to make a note
 * "newer" than its indexed mtime.
 */
export function makeClockFake(
  initialNowMs = 0,
  initialToday = "2026-01-01",
  initialTimeHHMM = "00:00",
): ClockFake {
  let nowMs = initialNowMs;
  let today = initialToday;
  let timeHHMM = initialTimeHHMM;

  return {
    nowMs: () => nowMs,
    today: () => today,
    timeHHMM: () => timeHHMM,
    setNowMs: (value: number) => {
      nowMs = value;
    },
    advanceMs: (deltaMs: number) => {
      nowMs += deltaMs;
    },
    setToday: (value: string) => {
      today = value;
    },
    setTimeHHMM: (value: string) => {
      timeHHMM = value;
    },
  };
}
