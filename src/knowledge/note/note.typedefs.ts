/** A plain scalar, or a list for YAML sequences (`tags: [a, b]` / `tags:\n  - a`). */
export type FrontmatterValue = string | readonly string[];

export type Frontmatter = ReadonlyMap<string, FrontmatterValue>;

export type ParsedFrontmatter = {
  readonly frontmatter: Frontmatter;
  readonly body: string;
};

/** A typed relation (`- depends_on [[Other Note]]`) or a plain wikilink filed under
 * the implicit `links_to` type. */
export type NoteRelation = {
  readonly relationType: string;
  readonly target: string;
};

export type ParsedNote = {
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
  readonly body: string;
  readonly tags: string;
  readonly rels: readonly NoteRelation[];
};

export type ParsedIndexNote = {
  readonly title: string;
  readonly description: string;
  readonly epic: string;
};

// What `YAML.parse` can produce for a frontmatter block. Deliberately NOT
// `unknown`/`any` — every branch is concrete.
export type YamlValue =
  | string
  | number
  | boolean
  | null
  | readonly YamlValue[]
  | YamlMapping;
export type YamlMapping = { readonly [key: string]: YamlValue };
