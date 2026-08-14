/**
 * The action the consolidation LLM chooses for one candidate. Values are the
 * exact strings the model is instructed to emit in the decision prompt.
 */
export enum ReflectorAction {
  Add = "ADD",
  Update = "UPDATE",
  Invalidate = "INVALIDATE",
  Noop = "NOOP",
}

/**
 * One parsed LLM decision about a candidate. Every field but `action` is
 * optional because the model may omit fields that don't apply to the chosen
 * action (e.g. `folder`/`title` for an `UPDATE`).
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

/** One existing KB note surfaced as related context for the reflector. */
export type RelatedNote = {
  readonly title: string;
  readonly path: string;
  readonly snippet: string;
};
