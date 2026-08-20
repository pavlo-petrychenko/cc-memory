import { parse as parseYaml } from "yaml";

export const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n/;
export const WIKILINK = /\[\[([^\]]+)\]\]/g;
export const TYPED_RELATION = /^\s*-\s+([a-z_]+)\s+\[\[([^\]]+)\]\]/gm;
export const INLINE_TAG = /(?:^|\s)#([A-Za-z][\p{L}\p{N}_/-]*)/gu;
export const TITLE = /^#\s+(.+?)\s*$/m;

export type Frontmatter = Map<string, string | string[]>;
export type NoteRelation = { relationType: string; target: string };
export type ParsedNote = {
  title: string;
  type: string;
  importance: number | null;
  body: string;
  tags: string;
  rels: NoteRelation[];
  epic: string;
  frontmatter: Frontmatter;
};

function stripChars(s: string, chars: string): string {
  let start = 0, end = s.length;
  while (start < end && chars.includes(s[start]!)) start++;
  while (end > start && chars.includes(s[end - 1]!)) end--;
  return s.slice(start, end);
}

function parsePythonInt(raw: string): number | null {
  const t = raw.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function beforePipe(raw: string): string {
  const i = raw.indexOf("|");
  return (i === -1 ? raw : raw.slice(0, i)).trim();
}

export function parseFrontmatter(text: string): { frontmatter: Frontmatter; body: string } {
  const m = FRONTMATTER.exec(text);
  if (!m) return { frontmatter: new Map(), body: text };
  const block = m[1] ?? "";
  const body = text.slice(m[0].length);
  try {
    const parsed: any = parseYaml(block);
    const fm = new Map<string, string | string[]>();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v)) fm.set(k, v.map(String));
        else if (v == null) fm.set(k, "");
        else fm.set(k, String(v));
      }
    }
    return { frontmatter: fm, body };
  } catch {
    const fm = new Map<string, string | string[]>();
    for (const line of block.split(/\r\n|\r|\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      fm.set(key, stripChars(raw, "'\""));
    }
    return { frontmatter: fm, body };
  }
}

function fmScalar(fm: Frontmatter, key: string): string | undefined {
  const v = fm.get(key);
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}
function fmImportance(fm: Frontmatter): number | null {
  const raw = fmScalar(fm, "importance");
  if (!raw) return null;
  return parsePythonInt(raw);
}
function fmTags(fm: Frontmatter): string[] {
  const v = fm.get("tags");
  if (!v) return [];
  if (Array.isArray(v)) return v.map(t => t.trim()).filter(Boolean);
  return stripChars(v, "[]").split(/[,\s]+/).map(t=>t.trim()).filter(Boolean);
}

export function parseNote(text: string, fallbackTitle: string): ParsedNote {
  const { frontmatter, body } = parseFrontmatter(text);
  const titleMatch = TITLE.exec(body);
  const title = titleMatch?.[1]?.trim() ?? fallbackTitle;
  const inlineTags: string[] = [];
  for (const m of body.matchAll(INLINE_TAG)) inlineTags.push(m[1] ?? "");
  const tagSet = new Set(inlineTags);
  for (const t of fmTags(frontmatter)) tagSet.add(t);
  const typed: NoteRelation[] = [];
  for (const m of body.matchAll(TYPED_RELATION)) typed.push({ relationType: m[1] ?? "", target: beforePipe(m[2] ?? "") });
  const typedTargets = new Set(typed.map(r=>r.target));
  const rels: NoteRelation[] = [...typed];
  for (const m of body.matchAll(WIKILINK)) {
    const target = beforePipe(m[1] ?? "");
    if (!typedTargets.has(target)) rels.push({ relationType: "links_to", target });
  }
  return {
    title,
    type: fmScalar(frontmatter, "type") ?? "note",
    importance: fmImportance(frontmatter),
    body,
    tags: [...tagSet].sort().join(" "),
    rels,
    epic: fmScalar(frontmatter, "epic") ?? "",
    frontmatter,
  };
}
