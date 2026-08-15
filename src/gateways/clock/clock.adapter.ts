import type { Clock } from "@/gateways/clock/clock.typedefs.ts";

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The real `Clock`, reading the system clock in **local** time, not UTC. */
export class ClockAdapter implements Clock {
  nowMs(): number {
    return Date.now();
  }

  today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  }

  timeHHMM(): string {
    const now = new Date();
    return `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`;
  }
}
