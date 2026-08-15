import { SLUG_ALLOWED_CHARACTER } from "@/core/utils/slug/slug.constants.ts";

/**
 * Remove every leading/trailing character that appears in `chars`, repeatedly,
 * from both ends. `String.prototype.trim` only strips whitespace, so stripping
 * an arbitrary character set (quotes, brackets, `" -*"`, etc.) goes through this
 * instead of a hand-rolled regex.
 */
export function stripChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end) {
    const character = text[start];
    if (character === undefined || !chars.includes(character)) break;
    start += 1;
  }
  while (end > start) {
    const character = text[end - 1];
    if (character === undefined || !chars.includes(character)) break;
    end -= 1;
  }
  return text.slice(start, end);
}

/**
 * Filter a worktree-relative slug candidate down to alphanumerics plus `-_.`,
 * replacing every other character with `-`, then trim leading/trailing `-`.
 * Empty after that -> `_root` (the repo-top-level worktree).
 */
export function sanitizeSlug(candidate: string): string {
  let filtered = "";
  for (const character of candidate) {
    filtered += SLUG_ALLOWED_CHARACTER.test(character) ? character : "-";
  }
  const trimmed = stripChars(filtered, "-");
  return trimmed === "" ? "_root" : trimmed;
}

/**
 * `-`/`_`-separated identifier -> Title Case words. Each word has its first
 * character uppercased and the REST lowercased (`"myAPI"` -> `"Myapi"`, not
 * `"MyAPI"`), matching the vault's existing home-note titles.
 */
export function titleize(id: string): string {
  return id
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => {
      const first = word[0];
      return first === undefined
        ? word
        : first.toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
