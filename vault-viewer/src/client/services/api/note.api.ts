import { noteSchema } from "@shared/contracts/note.contract.js";
import { fetchJson } from "./client.js";

export async function getNote(
  workspace: string,
  path: string,
  signal?: AbortSignal,
): Promise<import("@shared/contracts/note.contract.js").NoteDto> {
  const url = `/api/note?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`;
  return fetchJson(url, noteSchema, { signal });
}
