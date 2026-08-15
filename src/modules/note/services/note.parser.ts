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
} from "@/modules/note/note.constants.ts";
import type {
  Frontmatter,
  FrontmatterValue,
  NoteRelation,
  ParsedFrontmatter,
  ParsedIndexNote,
  ParsedNote,
  YamlMapping,
  YamlValue,
} from "@/modules/note/note.entity.ts";

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

/** A naive fallback for a block that isn't valid YAML: one `key: value` pair per
 * line, quotes stripped. */
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

// A named predicate, because `Array.isArray` alone can't narrow a `readonly T[]`
// union member away on the false branch (it isn't assignable to `any[]`).
function isFrontmatterList(value: FrontmatterValue): value is readonly string[] {
  return Array.isArray(value);
}

function frontmatterScalar(value: FrontmatterValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  return isFrontmatterList(value) ? value[0] : value;
}

/** Unlike `Number.parseInt`, a numeric prefix followed by trailing garbage (e.g.
 * `"5abc"`) is rejected outright rather than parsed as `5`. */
function parsePythonInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function frontmatterImportance(value: FrontmatterValue | undefined): number | null {
  const raw = frontmatterScalar(value);
  if (raw === undefined || raw === "") return null;
  return parsePythonInt(raw);
}

/** A `tags` value may be a YAML list, or (from the fallback parser, or a single-line
 * flow scalar) a string like `"[a, b, c]"` needing a comma/whitespace split. */
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

function stripLeadingBlockquoteMarkers(line: string): string {
  let start = 0;
  while (start < line.length && line[start] === ">") start += 1;
  return line.slice(start);
}

/** A YAML-based frontmatter parser with a tolerant fallback: an invalid block falls
 * back to a naive line-splitter so a malformed vault file still parses (just
 * without list/multiline field support). */
export class NoteParser {
  /** The regex match is anchored at the true start of the string: a file that
   * doesn't open with `---` has no frontmatter at all, and the whole text is body. */
  parseFrontmatter(text: string): ParsedFrontmatter {
    const match = FRONTMATTER.exec(text);
    if (match === null) return { frontmatter: new Map(), body: text };
    const block = match[1] ?? "";
    const body = text.slice(match[0].length);
    try {
      // `YAML.parse` is typed `any`; annotating narrows it to `YamlValue` immediately.
      const parsed: YamlValue = parseYaml(block);
      return { frontmatter: frontmatterFromYaml(parsed), body };
    } catch {
      return { frontmatter: frontmatterFromLines(block), body };
    }
  }

  extractWikilinks(body: string): readonly string[] {
    const targets: string[] = [];
    for (const match of body.matchAll(WIKILINK)) {
      targets.push(beforePipe(match[1] ?? ""));
    }
    return targets;
  }

  extractTypedRelations(body: string): readonly NoteRelation[] {
    const relations: NoteRelation[] = [];
    for (const match of body.matchAll(TYPED_RELATION)) {
      relations.push({
        relationType: match[1] ?? "",
        target: beforePipe(match[2] ?? ""),
      });
    }
    return relations;
  }

  extractInlineTags(body: string): readonly string[] {
    const tags: string[] = [];
    for (const match of body.matchAll(INLINE_TAG)) {
      tags.push(match[1] ?? "");
    }
    return tags;
  }

  /** Strips wikilinks down to display text, drops `**`/backticks, collapses
   * whitespace, and truncates at `maxLen` on the last space. */
  cleanInline(text: string, maxLen: number): string {
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

  /** `fallbackTitle` is used when no `# ` heading is present; this module has no
   * notion of paths, so the caller (which does) supplies the filename stem. */
  parse(text: string, fallbackTitle: string): ParsedNote {
    const { frontmatter, body } = this.parseFrontmatter(text);
    const titleMatch = TITLE.exec(body);
    const title = titleMatch?.[1] ?? fallbackTitle;

    const tags = new Set(this.extractInlineTags(body));
    for (const tag of frontmatterTags(frontmatter.get("tags"))) tags.add(tag);

    const typedRelations = this.extractTypedRelations(body);
    const typedTargets = new Set(typedRelations.map((relation) => relation.target));
    const relations: NoteRelation[] = [...typedRelations];
    for (const target of this.extractWikilinks(body)) {
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

  /** The title is the first `# ` heading (KB-index suffix stripped); the description
   * is every contiguous blockquote line right after it, joined and cleaned. */
  parseIndex(text: string): ParsedIndexNote {
    const { frontmatter, body } = this.parseFrontmatter(text);
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
        ? this.cleanInline(quoteLines.join(" "), INDEX_NOTE_DESCRIPTION_MAX_LENGTH)
        : "";
    return { title, description, epic };
  }
}
