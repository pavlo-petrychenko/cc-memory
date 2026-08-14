export class NotesFormatter {
  /** An explicit empty string is treated the same as `null` (no folder). */
  noNotes(folder: string | null): string {
    return folder === null ? "(no notes)" : `(no notes) under ${folder}`;
  }

  /** `importance` renders as `"-"` when absent, before the right-justify
   * padding is applied. */
  noteLine(importance: number | null, type: string, path: string, title: string): string {
    const importanceText = importance === null ? "-" : String(importance);
    const typeText = type === "" ? "note" : type;
    return `[${importanceText.padStart(2)}] ${typeText.padEnd(5)}  ${path}  — ${title}`;
  }
}
