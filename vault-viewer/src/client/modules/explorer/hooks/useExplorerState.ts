import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "explorer:expanded";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // ignore
  }
  return new Set<string>([""]);
}

export function useExplorerState() {
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]));
    } catch {
      // ignore
    }
  }, [expanded]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const isExpanded = useCallback((path: string) => expanded.has(path), [expanded]);

  const expandAll = useCallback((paths: string[]) => {
    setExpanded(new Set(paths));
  }, []);

  return { expanded, toggle, isExpanded, expandAll, setExpanded };
}

export type ExplorerState = ReturnType<typeof useExplorerState>;
