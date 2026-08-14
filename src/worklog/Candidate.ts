/**
 * One promotion candidate distilled from a worklog entry — a `#promote` line, or a
 * `**Learned:**`/`**Decided:**` field.
 *
 * Lives in `worklog/` rather than `reflect/` because worklog parsing PRODUCES it and
 * the reflector merely consumes it. Having it the other way round would make
 * `worklog` and `reflect` import each other.
 */
export type Candidate = {
  readonly text: string;
  readonly src: string;
};
