/** The two indexed corpora a search can target — `notes_fts` (the vault) or
 * `worklog_fts` (recent worklogs). */
export enum SearchKind {
  Notes = "notes",
  Worklog = "worklog",
}
