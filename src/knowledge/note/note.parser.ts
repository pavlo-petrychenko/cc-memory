import { parse as parseYaml } from "yaml";

import { stripChars } from "@/core/index.ts";
import {
  FRONTMATTER,
  INDEX_NOTE_DESCRIPTION_MAX_LENGTH,
  INLINE_TAG,
  KB_INDEX_TITLE_SUFFIX,
  TITLE,
  TYPED_RELATION,
  WIKILINK,
} from "@/knowledge/note/note.constants.ts";
import type {
  Frontmatter,
  FrontmatterValue,
  NoteRelation,
  ParsedFrontmatter,
  ParsedIndexNote,
  ParsedNote,
  YamlMapping,
  YamlValue,
} from "@/knowledge/note/note.typedefs.ts";

/**
 * One YAML-based frontmatter parser with a tolerant fallback: a note whose
 * frontmatter block isn't valid YAML falls back to a naive line-splitter so
 * a malformed vault file still parses (just without list/multiline field
 * support).
 */

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
 * A naive frontmatter fallback: one `key: value` pair per line, quotes
 * stripped. Used only when the block isn't valid YAML.
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
 * Accepts only an optional sign followed by digits (whitespace-trimmed).
 * Unlike `Number.parseInt`, a numeric prefix followed by trailing garbage
 * (e.g. `"5abc"`) is rejected outright rather than parsed as `5`.
 */
function parsePythonInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function frontmatterImportance(value: FrontmatterValue | undefined): number | null {
  const raw = frontmatterScalar(value);
  // An absent or empty value skips the parse attempt entirely.
  if (raw === undefined || raw === "") return null;
  return parsePythonInt(raw);
}

/**
 * A `tags` frontmatter value may be a YAML list, or (from the fallback
 * parser, or a single-line flow scalar) a string like `"[a, b, c]"` needing
 * a comma/whitespace split.
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
 * Split a note's text into its frontmatter fields and body. The regex match
 * is anchored at the true start of the string: a file that doesn't open with
 * `---` has no frontmatter at all, and the whole text is body.
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

/** Wikilink targets in a note body, with any `|display` label stripped. */
export function extractWikilinks(body: string): readonly string[] {
  const targets: string[] = [];
  for (const match of body.matchAll(WIKILINK)) {
    targets.push(beforePipe(match[1] ?? ""));
  }
  return targets;
}

/** `- rel_type [[Target]]` lines, target cleaned the same way as `extractWikilinks`. */
export function extractTypedRelations(body: string): readonly NoteRelation[] {
  const relations: NoteRelation[] = [];
  for (const match of body.matchAll(TYPED_RELATION)) {
    relations.push({ relationType: match[1] ?? "", target: beforePipe(match[2] ?? "") });
  }
  return relations;
}

/** Inline `#tag` occurrences, unfiltered and undeduplicated — callers combine as needed. */
export function extractInlineTags(body: string): readonly string[] {
  const tags: string[] = [];
  for (const match of body.matchAll(INLINE_TAG)) {
    tags.push(match[1] ?? "");
  }
  return tags;
}

/**
 * Strip wikilinks down to display text, drop `**`/backticks, collapse
 * whitespace, and truncate at `maxLen` on the last space. Used for the
 * KB-map feature descriptions pulled from a note's blockquote.
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
 * Full note parse: frontmatter + title + tags (frontmatter ∪ inline) + typed
 * and plain-wikilink relations + importance. `fallbackTitle` is the note's
 * filename stem, used when no `# ` heading is present; domain code has no
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

function stripLeadingBlockquoteMarkers(line: string): string {
  let start = 0;
  while (start < line.length && line[start] === ">") start += 1;
  return line.slice(start);
}

/**
 * Parses a feature's index note: `epic:` comes from the shared frontmatter
 * parser; the title is the first `# ` heading (with the KB-index home-note
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
