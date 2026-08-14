/**
 * The action the consolidation LLM chooses for one candidate (`bin/reflector.py`'s
 * `PROMPT`, lines 107-111). Values are the exact strings the model is instructed
 * to emit — copy verbatim.
 */
export enum ReflectorAction {
  Add = "ADD",
  Update = "UPDATE",
  Invalidate = "INVALIDATE",
  Noop = "NOOP",
}

/**
 * One parsed LLM decision about a candidate (`bin/reflector.py:161-176`). Every
 * field but `action` is optional because the model may omit fields that don't
 * apply to the chosen action (e.g. `folder`/`title` for an `UPDATE`).
 */
export type ReflectorDecision = {
  readonly action: ReflectorAction;
  readonly title?: string;
  readonly folder?: string;
  readonly path?: string;
  readonly body?: string;
  readonly importance?: number;
  readonly rationale?: string;
  readonly source?: string;
};

/** One existing KB note surfaced as related context for the reflector (`bin/reflector.py:91-96`). */
export type RelatedNote = {
  readonly title: string;
  readonly path: string;
  readonly snippet: string;
};
