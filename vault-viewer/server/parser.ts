export const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n/;
export const WIKILINK = /\[\[([^\]]+)\]\]/g;
export const TYPED_RELATION = /^\s*-\s+([a-z_]+)\s+\[\[([^\]]+)\]\]/gm;
export const INLINE_TAG = /(?:^|\s)#([A-Za-z][\p{L}\p{N}_/-]*)/gu;
export const TITLE_RE = /^#\s+(.+?)\s*$/m;

function beforePipe(raw: string): string {
  const i = raw.indexOf("|");
  return (i === -1 ? raw : raw.slice(0, i)).trim();
}

export type ParsedNote = {
  title: string;
  type: string;
  importance: number | null;
  tags: string;
  epic: string;
  body: string;
  rels: { relationType: string; target: string }[];
};

function parseFrontmatter(block: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of block.split(/\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    m.set(k, v);
  }
  return m;
}

export function parseNote(text: string, fallbackTitle: string): ParsedNote {
  let fm = new Map<string, string>();
  let body = text;
  const match = FRONTMATTER.exec(text);
  if (match) {
    fm = parseFrontmatter(match[1] ?? "");
    body = text.slice(match[0].length);
  }
  const titleMatch = TITLE_RE.exec(body);
  const title = titleMatch?.[1]?.trim() ?? fallbackTitle;

  // type
  const type = fm.get("type") ?? "note";
  const impRaw = fm.get("importance");
  let importance: number | null = null;
  if (impRaw && impRaw !== "") {
    const n = Number.parseInt(impRaw, 10);
    if (!Number.isNaN(n) && /^[+-]?\d+$/.test(impRaw.trim())) importance = n;
  }
  const epic = fm.get("epic") ?? "";

  // tags
  const tagsSet = new Set<string>();
  // inline
  for (const mm of body.matchAll(INLINE_TAG)) {
    if (mm[1]) tagsSet.add(mm[1]);
  }
  // frontmatter tags like "[a, b]" or "a, b"
  const fmTags = fm.get("tags");
  if (fmTags) {
    const cleaned = fmTags.replace(/^\[|\]$/g, "");
    for (const t of cleaned.split(/[,\s]+/)) {
      const trimmed = t.trim();
      if (trimmed) tagsSet.add(trimmed);
    }
  }

  // typed relations
  const rels: { relationType: string; target: string }[] = [];
  const typedTargets = new Set<string>();
  for (const mm of body.matchAll(TYPED_RELATION)) {
    const rt = mm[1] ?? "";
    const target = beforePipe(mm[2] ?? "");
    if (rt && target) {
      rels.push({ relationType: rt, target });
      typedTargets.add(target);
    }
  }
  for (const mm of body.matchAll(WIKILINK)) {
    // skip those already captured via typed (typed regex already matches wikilinks with prefix)
    // we need to avoid double counting typed lines: typed already includes [[...]], but wikilink will also match them.
    // So check if this wikilink is inside a typed line - we already added typedTargets, skip if in set
    const target = beforePipe(mm[1] ?? "");
    if (!typedTargets.has(target) && target) {
      rels.push({ relationType: "links_to", target });
    }
  }

  return {
    title,
    type,
    importance,
    tags: [...tagsSet].sort().join(" "),
    epic,
    body,
    rels,
  };
}
