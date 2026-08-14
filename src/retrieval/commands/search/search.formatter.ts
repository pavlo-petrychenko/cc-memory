export class SearchFormatter {
  // `bun test --coverage` treats a class with no explicit constructor as
  // having an unreachable synthetic one, which drags its function-coverage
  // percentage down even at 100% line coverage — a non-empty (if inert)
  // constructor body keeps that synthetic slot out of the count.

  /** Two lines: the bullet, then the snippet indented by two spaces. */
  hit(title: string, relativePath: string, snippet: string): readonly string[] {
    return [`• ${title}  (${relativePath})`, `  ${snippet}`];
  }
}
