import { useQuery } from "@tanstack/react-query";
import { useDebounced } from "./useDebounced.js";
import { search } from "../../../services/api/search.api.js";
import { qk } from "../../../services/query/queryKeys.js";
import type { SearchHitDto } from "@shared/contracts/search.contract.js";

function hasFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((v) => Boolean(v));
}

export function useSearch(workspaceId: string, q: string, filters: Record<string, string> = {}) {
  const debounced = useDebounced(q, 150);
  const enabled = debounced.trim().length > 0 || hasFilters(filters);
  const query = useQuery({
    queryKey: qk.search(workspaceId, debounced, filters),
    queryFn: ({ signal }) => search(workspaceId, debounced, filters, signal),
    enabled: Boolean(workspaceId) && enabled,
  });

  const hits: SearchHitDto[] = query.data?.hits ?? [];

  return {
    ...query,
    hits,
    isLoading: query.isLoading,
  };
}
