/**
 * One frontmatter field's value, after YAML parsing (or the tolerant fallback
 * in `note.parser.ts`) normalizes it to something every caller can consume
 * without re-parsing: a plain scalar, or a list for YAML sequences
 * (`tags: [a, b]` / `tags:\n  - a\n  - b`).
 */
export type FrontmatterValue = string | readonly string[];

/** A note's parsed `---`-delimited frontmatter block, keyed by field name. */
export type Frontmatter = ReadonlyMap<string, FrontmatterValue>;

/** The result of splitting a note's text into its frontmatter fields and body. */
export type ParsedFrontmatter = {
  readonly frontmatter: Frontmatter;
  readonly body: string;
};

/**
 * One relation extracted from a note body: a typed relation (`- depends_on
 * [[Other Note]]`) or a plain wikilink filed under the implicit `links_to`
 * type.
 */
export type NoteRelation = {
  readonly relationType: string;
  readonly target: string;
};

/** The unified shape of a fully parsed vault note — what `parseNote` returns. */
export type ParsedNote = {
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
  readonly body: string;
  readonly tags: string;
  readonly rels: readonly NoteRelation[];
};

/** The unified shape of a fully parsed feature index note — what `parseIndexNote` returns. */
export type ParsedIndexNote = {
  readonly title: string;
  readonly description: string;
  readonly epic: string;
};

// A value that could plausibly come out of `YAML.parse` for a frontmatter block:
// a scalar, a nested list, or a nested mapping. Deliberately NOT `unknown`/`any` —
// every branch is concrete, so the anti-slop dictionary-safety rules are satisfied
// while still describing "arbitrary YAML" honestly.
export type YamlValue =
  | string
  | number
  | boolean
  | null
  | readonly YamlValue[]
  | YamlMapping;
export type YamlMapping = { readonly [key: string]: YamlValue };
