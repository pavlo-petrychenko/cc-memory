export class SearchFormatter {
  // A non-empty constructor keeps bun's coverage report from counting an
  // unreachable synthetic default constructor against this class.

  hit(title: string, relativePath: string, snippet: string): readonly string[] {
    return [`• ${title}  (${relativePath})`, `  ${snippet}`];
  }
}
