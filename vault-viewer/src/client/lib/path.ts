export function relPathToTitle(relPath: string): string {
  return relPath.split("/").pop()?.replace(/\.md$/, "") ?? relPath;
}

export function isWorklogPath(relPath: string, worklogSlugs: string[]): boolean {
  const slug = relPath.split("/")[0] ?? "";
  return worklogSlugs.includes(slug);
}

export function isStatePath(relPath: string): boolean {
  return relPath.endsWith("STATE.md");
}

export function isDailyNotePath(relPath: string): boolean {
  const base = relPath.split("/").pop() ?? "";
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(base);
}

export function parseWorklogSlug(relPath: string): string | null {
  const parts = relPath.split("/");
  if (parts.length < 2) return null;
  return parts[0] ?? null;
}
