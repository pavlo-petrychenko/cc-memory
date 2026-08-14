/** Two lines: the bullet, then the snippet indented by two spaces. */
export function formatSearchHit(
  title: string,
  relativePath: string,
  snippet: string,
): readonly string[] {
  return [`• ${title}  (${relativePath})`, `  ${snippet}`];
}
