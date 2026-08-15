/**
 * The one seam onto wall-clock time. Domain code takes dates/times as parameters
 * (the layering rule) — this is what services and entrypoints read them from, so
 * a test controls "now" via `fakes/clockFixed.fake.ts` instead of a real clock.
 */
export type Clock = {
  /** Milliseconds since epoch. */
  readonly nowMs: () => number;
  /** Local calendar date, `YYYY-MM-DD`. Local, not UTC: reads the system's
   * local calendar day. */
  readonly today: () => string;
  /** Local 24-hour clock, `HH:MM`, zero-padded — fills the worklog entry
   * template's `{time}` field. */
  readonly timeHHMM: () => string;
};
