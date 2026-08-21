import { useQuery } from "@tanstack/react-query";
import { useDebounced } from "./useDebounced.js";
import { search } from "../../../services/api/search.api.js";
import { qk } from "../../../services/query/queryKeys.js";

function hasFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((v) => !!v);
}

export function useSearch(workspaceId: string, q: string, filters: Record<string, string> = {}) {
  const debounced = useDebounced(q, 150);
  const enabled = debounced.trim().length > 0 || hasFilters(filters);
  return useQuery({
    queryKey: qk.search(workspaceId, debounced, filters),
    queryFn: ({ signal }) => search(workspaceId, debounced, filters, signal),
    enabled: !!workspaceId && enabled,
  });
}
