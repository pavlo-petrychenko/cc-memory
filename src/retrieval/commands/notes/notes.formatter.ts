/** An explicit empty string is treated the same as `null` (no folder). */
export function formatNoNotes(folder: string | null): string {
  return folder === null ? "(no notes)" : `(no notes) under ${folder}`;
}

/** `importance` renders as `"-"` when absent, before the right-justify
 * padding is applied. */
export function formatNoteLine(
  importance: number | null,
  type: string,
  path: string,
  title: string,
): string {
  const importanceText = importance === null ? "-" : String(importance);
  const typeText = type === "" ? "note" : type;
  return `[${importanceText.padStart(2)}] ${typeText.padEnd(5)}  ${path}  — ${title}`;
}
