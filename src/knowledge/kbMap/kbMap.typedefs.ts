export type KbMapFeature = {
  readonly name: string;
  /** Whether `<kb>/<name>/<name>.md` exists at all — distinct from having a title/description. */
  readonly hasIndexNote: boolean;
  readonly title: string;
  readonly description: string;
  readonly epic: string;
};

export type KbMapInput = {
  /** The vault path, already tildified for display (e.g. `~/vault`). */
  readonly vaultLabel: string;
  readonly features: readonly KbMapFeature[];
  /** Top-level `.md` filenames minus their extension, excluding daily journal files. */
  readonly looseNotes: readonly string[];
};
