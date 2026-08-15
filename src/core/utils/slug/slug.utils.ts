import { SLUG_ALLOWED_CHARACTER } from "@/core/utils/slug/slug.constants.ts";

/** `String.prototype.trim` only strips whitespace; this strips an arbitrary
 * character set (quotes, brackets, etc.) from both ends instead. */
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

/** Replaces every character not in the allowed set with `-`, trims leading/trailing
 * `-`, and falls back to `_root` (the repo-top-level worktree) when empty. */
export function sanitizeSlug(candidate: string): string {
  let filtered = "";
  for (const character of candidate) {
    filtered += SLUG_ALLOWED_CHARACTER.test(character) ? character : "-";
  }
  const trimmed = stripChars(filtered, "-");
  return trimmed === "" ? "_root" : trimmed;
}

/** Each word has its first character uppercased and the REST lowercased
 * (`"myAPI"` -> `"Myapi"`, not `"MyAPI"`), matching the vault's home-note titles. */
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
