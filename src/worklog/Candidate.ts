/**
 * One promotion candidate distilled from a worklog entry — a `#promote` line, or a
 * `**Learned:**`/`**Decided:**` field (`bin/reflector.py:52-88`).
 *
 * Lives in `worklog/` rather than `reflect/` because worklog parsing PRODUCES it and
 * the reflector merely consumes it. Having it the other way round made `worklog` and
 * `reflect` import each other — a cycle the module layout surfaced immediately.
 */
export type Candidate = {
  readonly text: string;
  readonly src: string;
};
