export type KbMapFeature = {
  readonly name: string;
  readonly hasIndexNote: boolean;
  readonly title: string;
  readonly description: string;
  readonly epic: string;
};

export type KbMapInput = {
  /** Already tildified for display (e.g. `~/vault`). */
  readonly vaultLabel: string;
  readonly features: readonly KbMapFeature[];
  readonly looseNotes: readonly string[];
};
