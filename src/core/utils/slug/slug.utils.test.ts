import { describe, expect, test } from "bun:test";

import { sanitizeSlug, stripChars, titleize } from "@/core/utils/slug/slug.utils.ts";

describe("stripChars", () => {
  test("strips leading and trailing characters in the set", () => {
    expect(stripChars('"quoted"', "'\"")).toBe("quoted");
  });

  test("strips repeated characters from both ends", () => {
    expect(stripChars("[[a, b]]", "[]")).toBe("a, b");
  });

  test("leaves interior characters untouched", () => {
    expect(stripChars("- keep - this -", " -*")).toBe("keep - this");
  });

  test("empty string stays empty", () => {
    expect(stripChars("", "-")).toBe("");
  });
});

describe("sanitizeSlug", () => {
  test("keeps alphanumerics, dots, dashes and underscores as-is", () => {
    expect(sanitizeSlug("my-feature_1.0")).toBe("my-feature_1.0");
  });

  test("replaces other characters with a dash", () => {
    expect(sanitizeSlug("a/b c")).toBe("a-b-c");
  });

  test("trims leading/trailing dashes produced by replacement", () => {
    expect(sanitizeSlug("/leading-and-trailing/")).toBe("leading-and-trailing");
  });

  test("an entirely-unsafe candidate becomes _root", () => {
    expect(sanitizeSlug("///")).toBe("_root");
  });

  test("an empty candidate becomes _root", () => {
    expect(sanitizeSlug("")).toBe("_root");
  });

  test("Unicode letters count as alphanumeric", () => {
    expect(sanitizeSlug("café")).toBe("café");
  });
});

describe("titleize", () => {
  test("splits on - and _, capitalizing each word", () => {
    expect(titleize("my-cool_project")).toBe("My Cool Project");
  });

  test("a single word is just capitalized", () => {
    expect(titleize("homeserver")).toBe("Homeserver");
  });

  test("the rest of the word is lowercased, not just the first letter capitalized", () => {
    expect(titleize("myAPI")).toBe("Myapi");
  });

  test("collapses adjacent separators without producing empty words", () => {
    expect(titleize("a--b")).toBe("A B");
  });
});
