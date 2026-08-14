import { describe, expect, test } from "bun:test";

import {
  cleanInline,
  extractInlineTags,
  extractTypedRelations,
  extractWikilinks,
  parseFrontmatter,
  parseIndexNote,
  parseNote,
} from "../../../src/domain/note.ts";

describe("parseFrontmatter", () => {
  test("no frontmatter -> empty fields, body is the whole text", () => {
    const { frontmatter, body } = parseFrontmatter("# Just a note\n\nbody text");
    expect(frontmatter.size).toBe(0);
    expect(body).toBe("# Just a note\n\nbody text");
  });

  test("the frontmatter regex is anchored: leading blank lines before --- do NOT count", () => {
    const text = "\n---\ntype: note\n---\n# Title\n";
    const { frontmatter } = parseFrontmatter(text);
    expect(frontmatter.size).toBe(0);
  });

  test("simple YAML scalars parse as strings", () => {
    const { frontmatter, body } = parseFrontmatter(
      "---\ntype: decision\nimportance: 7\n---\nbody\n",
    );
    expect(frontmatter.get("type")).toBe("decision");
    expect(frontmatter.get("importance")).toBe("7");
    expect(body).toBe("body\n");
  });

  test("a YAML flow list parses as a string array — bugfix #5", () => {
    const { frontmatter } = parseFrontmatter("---\ntags: [alpha, beta]\n---\nbody\n");
    expect(frontmatter.get("tags")).toEqual(["alpha", "beta"]);
  });

  test("a YAML block list (multiline) parses as a string array — bugfix #5", () => {
    const { frontmatter } = parseFrontmatter(
      "---\ntags:\n  - alpha\n  - beta\n---\nbody\n",
    );
    expect(frontmatter.get("tags")).toEqual(["alpha", "beta"]);
  });

  test("a quoted scalar has its quotes stripped by YAML itself", () => {
    const { frontmatter } = parseFrontmatter('---\nepic: "roadmap-2"\n---\nbody\n');
    expect(frontmatter.get("epic")).toBe("roadmap-2");
  });

  test("malformed YAML falls back to the naive line-splitter, quotes stripped", () => {
    // Unbalanced quote and a tab character are enough to make this invalid
    // YAML while still being a perfectly parseable naive `key: value` line.
    const { frontmatter, body } = parseFrontmatter(
      '---\ntype: "unterminated\nother: value\n---\nbody\n',
    );
    expect(frontmatter.get("type")).toBe("unterminated");
    expect(frontmatter.get("other")).toBe("value");
    expect(body).toBe("body\n");
  });

  test("the fallback strips only single/double quotes, not brackets", () => {
    const { frontmatter } = parseFrontmatter(
      '---\ntype: "unterminated\ntags: [a, b]\n---\nbody\n',
    );
    expect(frontmatter.get("tags")).toBe("[a, b]");
  });
});

describe("extractWikilinks / extractTypedRelations / extractInlineTags", () => {
  test("a plain wikilink's display label is stripped", () => {
    expect(extractWikilinks("see [[Target Note|shown text]] for more")).toEqual([
      "Target Note",
    ]);
  });

  test("a typed relation captures its type and cleaned target", () => {
    const relations = extractTypedRelations(
      "- depends_on [[Other Note|label]]\n- links_to [[Third]]",
    );
    expect(relations).toEqual([
      { relationType: "depends_on", target: "Other Note" },
      { relationType: "links_to", target: "Third" },
    ]);
  });

  test("inline tags are returned unfiltered and undeduplicated", () => {
    expect(extractInlineTags("intro #alpha more text #alpha again #beta/gamma")).toEqual([
      "alpha",
      "alpha",
      "beta/gamma",
    ]);
  });

  test("a tag at the very start of the text (no preceding whitespace) is still found", () => {
    expect(extractInlineTags("#leading tag then text")).toEqual(["leading"]);
  });
});

describe("cleanInline", () => {
  test("collapses a piped wikilink to its display label", () => {
    expect(cleanInline("see [[Target|the label]] here", 200)).toBe("see the label here");
  });

  test("collapses a plain wikilink to its target text", () => {
    expect(cleanInline("see [[Target]] here", 200)).toBe("see Target here");
  });

  test("drops ** and backticks, collapses whitespace", () => {
    expect(cleanInline("**bold**   and `code`  text", 200)).toBe("bold and code text");
  });

  test("truncates on the last space and appends an ellipsis", () => {
    expect(cleanInline("one two three four five", 15)).toBe("one two three…");
  });

  test("text at or under the limit is untouched", () => {
    expect(cleanInline("short", 15)).toBe("short");
  });
});

describe("parseNote", () => {
  test("title comes from the first H1 in the body, not the frontmatter", () => {
    const note = parseNote(
      "---\ntype: note\n---\n# The Real Title\n\nbody\n",
      "fallback",
    );
    expect(note.title).toBe("The Real Title");
  });

  test("falls back to the caller-supplied title when there is no H1", () => {
    const note = parseNote("no heading here", "My Note");
    expect(note.title).toBe("My Note");
  });

  test("type defaults to 'note' when the frontmatter key is absent", () => {
    expect(parseNote("body only", "t").type).toBe("note");
  });

  test("type is read verbatim from frontmatter when present", () => {
    expect(parseNote("---\ntype: decision\n---\nbody", "t").type).toBe("decision");
  });

  test("importance parses a valid integer", () => {
    expect(parseNote("---\nimportance: 8\n---\nbody", "t").importance).toBe(8);
  });

  test("importance is null when the key is absent", () => {
    expect(parseNote("body", "t").importance).toBeNull();
  });

  test("importance is null when the value doesn't parse as a Python int (unlike parseInt's lenient prefix parse)", () => {
    expect(parseNote("---\nimportance: 5abc\n---\nbody", "t").importance).toBeNull();
  });

  test("importance is null for an empty value, without even attempting to parse", () => {
    expect(parseNote("---\nimportance:\n---\nbody", "t").importance).toBeNull();
  });

  test("tags combine inline #tags and frontmatter tags, sorted and space-joined", () => {
    const note = parseNote(
      "---\ntags: [zulu, alpha]\n---\nbody mentioning #bravo and #alpha again",
      "t",
    );
    expect(note.tags).toBe("alpha bravo zulu");
  });

  test("a scalar (non-list) frontmatter tags value is comma/whitespace-split (index.py:88-89)", () => {
    const note = parseNote('---\ntags: "alpha, beta"\n---\nbody', "t");
    expect(note.tags).toBe("alpha beta");
  });

  test("a plain wikilink becomes a links_to relation", () => {
    const note = parseNote("body [[Some Note]]", "t");
    expect(note.rels).toEqual([{ relationType: "links_to", target: "Some Note" }]);
  });

  test("a wikilink already covered by a typed relation is not duplicated as links_to", () => {
    const note = parseNote("- depends_on [[Some Note]]\n\nsee also [[Some Note]]", "t");
    expect(note.rels).toEqual([{ relationType: "depends_on", target: "Some Note" }]);
  });

  test("the parsed body excludes the frontmatter block", () => {
    const note = parseNote("---\ntype: note\n---\n# Title\nbody\n", "t");
    expect(note.body).toBe("# Title\nbody\n");
  });
});

describe("parseIndexNote", () => {
  test("golden: title, description and epic all present", () => {
    const text =
      "---\nepic: roadmap-2\n---\n" +
      "# CC-memory — Knowledge Base Index\n\n" +
      "> Knowledge base for the **cc-memory** workspace.\n" +
      "> More detail on the next quoted line.\n\n" +
      "not a quote line\n";
    const parsed = parseIndexNote(text);
    expect(parsed.title).toBe("CC-memory");
    expect(parsed.description).toBe(
      "Knowledge base for the cc-memory workspace. More detail on the next quoted line.",
    );
    expect(parsed.epic).toBe("roadmap-2");
  });

  test("no frontmatter, no quote -> empty description and epic", () => {
    const parsed = parseIndexNote("# Just A Title\n\nsome prose, no blockquote\n");
    expect(parsed.title).toBe("Just A Title");
    expect(parsed.description).toBe("");
    expect(parsed.epic).toBe("");
  });

  test("blockquote lines before AND after the title both feed the description (quirk)", () => {
    // The Python loop's blockquote branch runs on every line regardless of
    // whether the title has been found yet — only a "# " line's own branch is
    // title-gated (and `continue`s past the blockquote check for that one
    // line). A blockquote before the title is collected too, since nothing
    // ever resets `quote` between it and the title line.
    const parsed = parseIndexNote(
      "> too early, no title yet\n# Title\n> real description\n",
    );
    expect(parsed.title).toBe("Title");
    expect(parsed.description).toBe("too early, no title yet real description");
  });
});
