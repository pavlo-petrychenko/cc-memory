import { useQuery } from "@tanstack/react-query";

import { listWorkspaces } from "../../../services/api/workspaces.api.js";
import { qk } from "../../../services/query/queryKeys.js";

export function useWorkspaces() {
  return useQuery({
    queryKey: qk.workspaces(),
    queryFn: ({ signal }) => listWorkspaces(signal),
  });
}
