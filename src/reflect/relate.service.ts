import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { search, SearchKind } from "../retrieval/search.service.ts";
import type { Candidate } from "../worklog/Candidate.ts";
import type { RelatedNote } from "./Reflector.ts";

// `related_notes(ws, candidates, limit=10)` (`bin/reflector.py:91`).
const RELATED_NOTES_LIMIT = 10;

/**
 * `os.path.relpath(h["path"], ws["kb"])` guarded by `path.startswith(kb)`
 * (`bin/reflector.py:95`) — the same prefix-stripping `retrieval/notes.ts`'s
 * `relativeToKb` does; duplicated locally (small, private) since that one
 * isn't exported.
 */
function relativeToKb(path: string, kb: string): string {
  const prefix = `${kb}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * `related_notes` (`bin/reflector.py:91-96`): the top `RELATED_NOTES_LIMIT`
 * KB notes for the concatenation of every candidate's text, via the plain
 * (non-fused) BM25 `notes` search — NOT `search_fused`, so no link-boost
 * config is needed here at all.
 */
export async function relatedNotes(
  container: Container,
  workspace: Workspace,
  candidates: readonly Candidate[],
): Promise<readonly RelatedNote[]> {
  const query = candidates.map((candidate) => candidate.text).join(" ");
  const hits = await search(container, workspace, query, {
    limit: RELATED_NOTES_LIMIT,
    kind: SearchKind.Notes,
  });
  return hits.map((hit) => ({
    title: hit.title,
    path: relativeToKb(hit.path, workspace.kb),
    snippet: hit.snippet,
  }));
}
