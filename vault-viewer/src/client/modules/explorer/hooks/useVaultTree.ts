import { useQuery } from "@tanstack/react-query";

import { getTree } from "../../../services/api/tree.api.js";
import { qk } from "../../../services/query/queryKeys.js";

export function useVaultTree(workspaceId: string) {
  return useQuery({
    queryKey: qk.tree(workspaceId),
    queryFn: ({ signal }) => getTree(workspaceId, signal),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}
