/** The one seam onto wall-clock time, so a test controls "now" via
 * `fakes/clockFixed.fake.ts` instead of a real clock. */
export type Clock = {
  readonly nowMs: () => number;
  /** Local calendar date, `YYYY-MM-DD` — not UTC. */
  readonly today: () => string;
  /** Local 24-hour clock, `HH:MM`, zero-padded. */
  readonly timeHHMM: () => string;
};
