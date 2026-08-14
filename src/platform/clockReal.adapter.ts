import type { Clock } from "./clock.port.ts";

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The real `Clock`, reading the system clock in **local** time, not UTC. */
export function makeClockRealAdapter(): Clock {
  return {
    nowMs: () => Date.now(),
    today: () => {
      const now = new Date();
      return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
    },
    timeHHMM: () => {
      const now = new Date();
      return `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`;
    },
  };
}
