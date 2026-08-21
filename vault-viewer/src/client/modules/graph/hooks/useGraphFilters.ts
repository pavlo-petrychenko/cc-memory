import { useCallback, useState } from "react";

export type GraphFilters = {
  typeFilter: string;
  tagFilter: string;
  featureFilter: string;
};

export function useGraphFilters(initial: Partial<GraphFilters> = {}) {
  const [typeFilter, setTypeFilter] = useState(initial.typeFilter ?? "");
  const [tagFilter, setTagFilter] = useState(initial.tagFilter ?? "");
  const [featureFilter, setFeatureFilter] = useState(initial.featureFilter ?? "");

  const clear = useCallback(() => {
    setTypeFilter("");
    setTagFilter("");
    setFeatureFilter("");
  }, []);

  return {
    typeFilter,
    tagFilter,
    featureFilter,
    setTypeFilter,
    setTagFilter,
    setFeatureFilter,
    clear,
    hasActive: Boolean(typeFilter || tagFilter || featureFilter),
  };
}
