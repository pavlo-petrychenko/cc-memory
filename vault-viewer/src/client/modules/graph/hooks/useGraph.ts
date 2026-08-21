import { useQuery } from "@tanstack/react-query";

import { getGraph } from "../../../services/api/graph.api.js";
import { qk } from "../../../services/query/queryKeys.js";

export function useGraph(
  workspace: string,
  focus: string | null,
  depth: number,
  full: boolean,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.graph(workspace, focus, depth, full),
    queryFn: ({ signal }) => getGraph(workspace, focus, depth, full, signal),
    enabled: enabled && Boolean(workspace),
    staleTime: 30_000,
  });
}
