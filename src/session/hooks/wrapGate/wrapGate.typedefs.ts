export type WrapGateInput = {
  readonly slug: string;
  readonly dirtyCount: number;
};

/** One session's entry in the shared `wrap-state.json`. */
export type WrapStateEntry = {
  readonly sig: string;
  readonly ts: number;
  readonly nudges: number;
};

/** The whole state file: session id -> its entry. */
export type WrapStateMap = Readonly<Record<string, WrapStateEntry>>;
