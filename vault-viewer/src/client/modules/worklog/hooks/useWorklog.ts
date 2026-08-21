import { useQuery } from "@tanstack/react-query";

import { getWorklog } from "../../../services/api/worklog.api.js";
import { qk } from "../../../services/query/queryKeys.js";

export function useWorklog(workspaceId: string, slug: string) {
  return useQuery({
    queryKey: qk.worklog(workspaceId, slug),
    queryFn: ({ signal }) => getWorklog(workspaceId, slug, signal),
    enabled: Boolean(workspaceId) && Boolean(slug),
  });
}
