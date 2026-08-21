import { useQuery } from "@tanstack/react-query";
import { getNote } from "../../../services/api/note.api.js";
import { qk } from "../../../services/query/queryKeys.js";

export function useNote(workspaceId: string, relPath: string) {
  return useQuery({
    queryKey: qk.note(workspaceId, relPath),
    queryFn: ({ signal }) => getNote(workspaceId, relPath, signal),
    enabled: !!relPath && !!workspaceId,
  });
}
