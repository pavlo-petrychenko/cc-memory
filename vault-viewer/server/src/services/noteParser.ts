import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const WIKILINK = /\[\[([^\]]+)\]\]/g;
const TYPED = /^\s*-\s+([a-z_]+)\s+\[\[([^\]]+)\]\]/gm;
const INLINE_TAG = /(?:^|\s)#([A-Za-z][\p{L}\p{N}_\/-]*)/gu;
const TITLE = /^#\s+(.+?)\s*$/m;

function beforePipe(s: string): string {
  const i = s.indexOf("|");
  return i === -1 ? s.trim() : s.slice(0, i).trim();
}

export type ParsedNote = {
  title: string;
  type: string;
  importance: number | null;
  tags: string[];
  epic: string | null;
  body: string;
  rawBody: string;
  rels: { relationType: string; target: string }[];
  frontmatter: Record<string, unknown>;
};

export function parseNote(text: string, fallbackTitle: string): ParsedNote {
  let fm: Record<string, unknown> = {};
  let body = text;
  const m = FRONTMATTER.exec(text);
  if (m) {
    try {
      fm = (parseYaml(m[1] ?? "") as Record<string, unknown>) ?? {};
    } catch { fm = {}; }
    body = text.slice(m[0].length);
  }
  const title = TITLE.exec(body)?.[1]?.trim() ?? fallbackTitle;
  const type = typeof fm["type"] === "string" ? fm["type"] as string : "note";
  const epic = typeof fm["epic"] === "string" ? fm["epic"] as string : null;
  let imp: number | null = null;
  if (fm["importance"] != null) {
    const n = Number.parseInt(String(fm["importance"]), 10);
    imp = Number.isNaN(n) ? null : n;
  }
  // tags
  const tags = new Set<string>();
  for (const mm of body.matchAll(INLINE_TAG)) tags.add(mm[1] ?? "");
  const ftags = fm["tags"];
  if (Array.isArray(ftags)) for (const t of ftags) if (typeof t === "string" && t) tags.add(t);
  else if (typeof ftags === "string") {
    for (const t of ftags.split(/[,\s]+/)) if (t) tags.add(t.replace(/^#/, ""));
  }
  // rels
  const rels: { relationType: string; target: string }[] = [];
  const typedTargets = new Set<string>();
  for (const mm of body.matchAll(TYPED)) {
    const t = beforePipe(mm[2] ?? "");
    rels.push({ relationType: mm[1] ?? "", target: t });
    typedTargets.add(t);
  }
  for (const mm of body.matchAll(WIKILINK)) {
    const tgt = beforePipe(mm[1] ?? "");
    if (!typedTargets.has(tgt)) rels.push({ relationType: "links_to", target: tgt });
  }
  return { title, type, importance: imp, tags: [...tags], epic, body, rawBody: body, rels, frontmatter: fm };
}

export function safeRead(path: string): string | null {
  try { return readFileSync(path, "utf-8"); } catch { return null; }
}
