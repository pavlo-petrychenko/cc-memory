import type { AbsPath } from "@/core/core.typedefs.ts";

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

/** The fields `NoteParser.parse` derives from a note's markdown — everything the
 * index needs except the path, which only the repository (which scans the vault)
 * can supply. */
export type ParsedNote = {
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
  readonly body: string;
  readonly tags: string;
  readonly rels: readonly NoteRelation[];
};

/** A note in the vault: its parsed fields plus the absolute path that identifies it.
 * The kb-relative form (path minus the vault root) is the entity's identity; the
 * absolute path is what the index keys on. */
export type Note = ParsedNote & {
  readonly path: AbsPath;
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
