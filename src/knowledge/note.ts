import { parse as parseYaml } from "yaml";

import { stripChars } from "../core/paths.ts";

/**
 * Unifies the PoC's two divergent, hand-rolled frontmatter parsers
 * (`index.py:69-104`'s `_parse_frontmatter`/`parse_note`, and
 * `session-start.py:31-60`'s `parse_main_note`) into one YAML-based parser with a
 * tolerant fallback — [[bugfixes]] #5. The fallback reproduces the old
 * naive-line-splitter behavior verbatim so a malformed vault file degrades
 * identically; the YAML path is a real behavior change (list/multiline
 * frontmatter now parses correctly), registered as an allowlisted divergence.
 *
 * The note-domain types (`Frontmatter`, `ParsedNote`, ...) live in this same file
 * rather than a separate `Note.ts`: this project's filesystem is case-insensitive
 * (macOS/APFS), so a type module and a function module cannot both be named
 * "note" in different cases — they would collide on one path.
 */

/**
 * One frontmatter field's value, after YAML parsing (or the tolerant fallback)
 * normalizes it to something every caller can consume without re-parsing: a plain
 * scalar, or a list for YAML sequences (`tags: [a, b]` / `tags:\n  - a\n  - b`).
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
 * [[Other Note]]`, `index.py:13`) or a plain wikilink filed under the implicit
 * `links_to` type (`index.py:92-95`).
 */
export type NoteRelation = {
  readonly relationType: string;
  readonly target: string;
};

/**
 * The unified shape of a fully parsed vault note — what `parseNote` returns.
 * Replaces `index.parse_note`'s dict (`index.py:81-104`).
 */
export type ParsedNote = {
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
  readonly body: string;
  readonly tags: string;
  readonly rels: readonly NoteRelation[];
};

// A value that could plausibly come out of `YAML.parse` for a frontmatter block:
// a scalar, a nested list, or a nested mapping. Deliberately NOT `unknown`/`any` —
// every branch is concrete, so the anti-slop dictionary-safety rules are satisfied
// while still describing "arbitrary YAML" honestly.
type YamlValue = string | number | boolean | null | readonly YamlValue[] | YamlMapping;
type YamlMapping = { readonly [key: string]: YamlValue };

// Anchored (JS's non-multiline `^` matches only true string-start, mirroring
// Python's `.match` vs `.search`), DOTALL via `[\s\S]` (`index.py:11`).
const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const WIKILINK = /\[\[([^\]]+)\]\]/g;
const TYPED_RELATION = /^\s*-\s+([a-z_]+)\s+\[\[([^\]]+)\]\]/gm;
// Python's `\w` on `str` is UNICODE-aware, so `index.py:14`'s `[\w/-]` accepts
// non-ASCII letters after the first character: `#café` captures "café" there. JS's
// `\w` is always ASCII, which would truncate it to "caf" — so the continuation class
// is spelled out with Unicode property escapes to match Python exactly. (The FIRST
// character is `[A-Za-z]` in both, so `#привет` matches in neither.) Verified against
// the Python regex on `#café`, `#tag_ok/sub`, `#привет` and `#promote`.
const INLINE_TAG = /(?:^|\s)#([A-Za-z][\p{L}\p{N}_/-]*)/gu;
const TITLE = /^#\s+(.+?)\s*$/m;
const KB_INDEX_TITLE_SUFFIX = /\s*[—-]\s*Knowledge Base Index\s*$/;

const INDEX_NOTE_DESCRIPTION_MAX_LENGTH = 200; // session-start.py:18 (MAX_DESC)

function isYamlMapping(value: YamlValue): value is YamlMapping {
  return value !== null && Object.prototype.toString.call(value) === "[object Object]";
}

function yamlScalarToString(value: YamlValue): string {
  if (value === null) return "";
  if (Array.isArray(value))
    return value.map((item) => yamlScalarToString(item)).join(", ");
  if (isYamlMapping(value)) return JSON.stringify(value);
  return String(value);
}

function yamlToFrontmatterValue(value: YamlValue): FrontmatterValue {
  return Array.isArray(value)
    ? value.map((item) => yamlScalarToString(item))
    : yamlScalarToString(value);
}

function frontmatterFromYaml(parsed: YamlValue): Frontmatter {
  const fields = new Map<string, FrontmatterValue>();
  if (!isYamlMapping(parsed)) return fields;
  for (const [key, value] of Object.entries(parsed)) {
    fields.set(key, yamlToFrontmatterValue(value));
  }
  return fields;
}

/**
 * The naive line-splitter every `.py` frontmatter parser used before the port
 * (`index.py:74-77`): one `key: value` pair per line, quotes stripped. Used only
 * when the block isn't valid YAML, so a malformed vault file behaves exactly as
 * it did before.
 */
function frontmatterFromLines(block: string): Frontmatter {
  const fields = new Map<string, FrontmatterValue>();
  for (const line of block.split(/\r\n|\r|\n/)) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();
    fields.set(key, stripChars(rawValue, "'\""));
  }
  return fields;
}

// `Array.isArray` alone narrows a `readonly T[]` union member in the true
// branch but NOT away from the false branch (a `readonly` array isn't
// assignable to the built-in guard's `any[]`, so TS can't exclude it there); a
// named predicate gives TypeScript an explicit type to exclude on the negative
// branch instead.
function isFrontmatterList(value: FrontmatterValue): value is readonly string[] {
  return Array.isArray(value);
}

/** Read one frontmatter value as a single scalar (first element, if it's a list). */
function frontmatterScalar(value: FrontmatterValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  return isFrontmatterList(value) ? value[0] : value;
}

/**
 * Python's bare `int(s)` accepts only an optional sign followed by digits
 * (whitespace-trimmed) — unlike `Number.parseInt`, it does NOT lenient-parse a
 * numeric prefix off a trailing-garbage string ("5abc" raises `ValueError`, so
 * the note's importance becomes `None`, not `5`).
 */
function parsePythonInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function frontmatterImportance(value: FrontmatterValue | undefined): number | null {
  const raw = frontmatterScalar(value);
  // `int(fm.get("importance", "")) if fm.get("importance") else None` — an absent
  // or empty value skips the parse attempt entirely (`index.py:96-99`).
  if (raw === undefined || raw === "") return null;
  return parsePythonInt(raw);
}

/**
 * `fm["tags"]` may now be a YAML list, or (from the fallback parser, or a
 * single-line flow scalar) a string like `"[a, b, c]"` needing the old
 * comma/whitespace split (`index.py:88-89`).
 */
function frontmatterTags(value: FrontmatterValue | undefined): readonly string[] {
  if (value === undefined) return [];
  if (isFrontmatterList(value)) {
    return value.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  return stripChars(value, "[]")
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function beforePipe(raw: string): string {
  const pipeIndex = raw.indexOf("|");
  return (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
}

/**
 * Split a note's text into its frontmatter fields and body. The regex match is
 * anchored at the true start of the string (`index.py:11,69-70`): a file that
 * doesn't open with `---` has no frontmatter at all, and the whole text is body.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const match = FRONTMATTER.exec(text);
  if (match === null) return { frontmatter: new Map(), body: text };
  const block = match[1] ?? "";
  const body = text.slice(match[0].length);
  try {
    // `YAML.parse` is typed `any`; annotating the binding narrows it to the
    // concrete `YamlValue` union immediately, before anything inspects its shape.
    const parsed: YamlValue = parseYaml(block);
    return { frontmatter: frontmatterFromYaml(parsed), body };
  } catch {
    return { frontmatter: frontmatterFromLines(block), body };
  }
}

/** Wikilink targets in a note body, with any `|display` label stripped (`index.py:12,92-95`). */
export function extractWikilinks(body: string): readonly string[] {
  const targets: string[] = [];
  for (const match of body.matchAll(WIKILINK)) {
    targets.push(beforePipe(match[1] ?? ""));
  }
  return targets;
}

/** `- rel_type [[Target]]` lines (`index.py:13,90`), target cleaned the same way as `extractWikilinks`. */
export function extractTypedRelations(body: string): readonly NoteRelation[] {
  const relations: NoteRelation[] = [];
  for (const match of body.matchAll(TYPED_RELATION)) {
    relations.push({ relationType: match[1] ?? "", target: beforePipe(match[2] ?? "") });
  }
  return relations;
}

/** Inline `#tag` occurrences (`index.py:14`), unfiltered and undeduplicated — callers combine as needed. */
export function extractInlineTags(body: string): readonly string[] {
  const tags: string[] = [];
  for (const match of body.matchAll(INLINE_TAG)) {
    tags.push(match[1] ?? "");
  }
  return tags;
}

/**
 * Strip wikilinks down to display text, drop `**`/backticks, collapse
 * whitespace, and truncate at `maxLen` on the last space (`session-start.py:21-28`).
 * Used for the KB-map feature descriptions pulled from a note's blockquote.
 */
export function cleanInline(text: string, maxLen: number): string {
  let cleaned = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1");
  cleaned = cleaned.replace(/\[\[([^\]]*)\]\]/g, "$1");
  cleaned = cleaned.replaceAll("**", "").replaceAll("`", "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLen) {
    const truncated = cleaned.slice(0, maxLen);
    const lastSpaceIndex = truncated.lastIndexOf(" ");
    cleaned =
      (lastSpaceIndex === -1 ? truncated : truncated.slice(0, lastSpaceIndex)) + "…";
  }
  return cleaned;
}

/**
 * Full note parse: frontmatter + title + tags (frontmatter ∪ inline) + typed and
 * plain-wikilink relations + importance (`index.py:81-104`). `fallbackTitle`
 * replaces `os.path.splitext(os.path.basename(path))[0]` — domain code has no
 * path, so the caller (which does) supplies it.
 */
export function parseNote(text: string, fallbackTitle: string): ParsedNote {
  const { frontmatter, body } = parseFrontmatter(text);
  const titleMatch = TITLE.exec(body);
  const title = titleMatch?.[1] ?? fallbackTitle;

  const tags = new Set(extractInlineTags(body));
  for (const tag of frontmatterTags(frontmatter.get("tags"))) tags.add(tag);

  const typedRelations = extractTypedRelations(body);
  const typedTargets = new Set(typedRelations.map((relation) => relation.target));
  const relations: NoteRelation[] = [...typedRelations];
  for (const target of extractWikilinks(body)) {
    if (!typedTargets.has(target)) relations.push({ relationType: "links_to", target });
  }

  return {
    title,
    type: frontmatterScalar(frontmatter.get("type")) ?? "note",
    importance: frontmatterImportance(frontmatter.get("importance")),
    body,
    tags: [...tags].toSorted().join(" "),
    rels: relations,
  };
}

export type ParsedIndexNote = {
  readonly title: string;
  readonly description: string;
  readonly epic: string;
};

function stripLeadingBlockquoteMarkers(line: string): string {
  let start = 0;
  while (start < line.length && line[start] === ">") start += 1;
  return line.slice(start);
}

/**
 * Unifies `session-start.py:31-60`'s `parse_main_note` onto the shared
 * `parseFrontmatter` for the `epic:` field, keeping its body-scanning quirks
 * verbatim: the title is the first `# ` heading (with the KB-index home-note
 * suffix stripped), and the description is every contiguous blockquote line
 * starting right after it, joined and cleaned.
 */
export function parseIndexNote(text: string): ParsedIndexNote {
  const { frontmatter, body } = parseFrontmatter(text);
  const epic = frontmatterScalar(frontmatter.get("epic")) ?? "";

  let title = "";
  const quoteLines: string[] = [];
  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (title === "" && line.startsWith("# ")) {
      title = line.slice(2).trim().replace(KB_INDEX_TITLE_SUFFIX, "").trim();
      continue;
    }
    if (line.startsWith(">")) {
      quoteLines.push(stripLeadingBlockquoteMarkers(line).trim());
    } else if (quoteLines.length > 0) {
      break;
    }
  }

  const description =
    quoteLines.length > 0
      ? cleanInline(quoteLines.join(" "), INDEX_NOTE_DESCRIPTION_MAX_LENGTH)
      : "";
  return { title, description, epic };
}
