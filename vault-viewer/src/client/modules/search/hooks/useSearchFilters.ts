import { useCallback, useMemo, useState } from "react";

export type SearchFiltersState = {
  typeFilter: string;
  tagFilter: string;
  featureFilter: string;
};

export type UseSearchFiltersReturn = {
  typeFilter: string;
  tagFilter: string;
  featureFilter: string;
  setTypeFilter: (v: string) => void;
  setTagFilter: (v: string) => void;
  setFeatureFilter: (v: string) => void;
  clear: () => void;
  hasFilters: boolean;
  filters: Record<string, string>;
};

export function useSearchFilters(initial?: Partial<SearchFiltersState>): UseSearchFiltersReturn {
  const [typeFilter, setTypeFilter] = useState<string>(initial?.typeFilter ?? "");
  const [tagFilter, setTagFilter] = useState<string>(initial?.tagFilter ?? "");
  const [featureFilter, setFeatureFilter] = useState<string>(initial?.featureFilter ?? "");

  const clear = useCallback(() => {
    setTypeFilter("");
    setTagFilter("");
    setFeatureFilter("");
  }, []);

  const hasFilters = Boolean(typeFilter || tagFilter || featureFilter);

  const filters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (typeFilter) f.type = typeFilter;
    if (tagFilter) f.tag = tagFilter;
    if (featureFilter) f.feature = featureFilter;
    return f;
  }, [typeFilter, tagFilter, featureFilter]);

  return {
    typeFilter,
    tagFilter,
    featureFilter,
    setTypeFilter,
    setTagFilter,
    setFeatureFilter,
    clear,
    hasFilters,
    filters,
  };
}
