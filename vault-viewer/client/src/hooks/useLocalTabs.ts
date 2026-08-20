import { useEffect, useState, useCallback } from "react";

export type Tab = { path: string; title: string };

export function useLocalTabs(workspaceId: string) {
  const key = `tabs:${workspaceId}`;
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as Tab[] : []; } catch { return []; }
  });
  const [active, setActive] = useState<string | null>(tabs[0]?.path ?? null);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(tabs)); } catch {}
  }, [tabs, key]);

  useEffect(() => {
    // reload when workspace changes
    try {
      const v = localStorage.getItem(key);
      const parsed = v ? JSON.parse(v) as Tab[] : [];
      setTabs(parsed);
      setActive(parsed[0]?.path ?? null);
    } catch { setTabs([]); setActive(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const open = useCallback((path: string, title?: string, newTab=false) => {
    setTabs((prev) => {
      const exists = prev.find((t) => t.path === path);
      if (exists) return prev;
      // if not newTab and there's an active, replace? keep IDE style: add
      if (newTab || prev.length === 0) return [...prev, { path, title: title ?? path }];
      // otherwise push
      return [...prev, { path, title: title ?? path }];
    });
    setActive(path);
  }, []);

  const close = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      if (active === path) {
        const fallback = next[Math.min(idx, next.length - 1)]?.path ?? next[0]?.path ?? null;
        setActive(fallback);
      }
      return next;
    });
  }, [active]);

  return { tabs, active, setActive, open, close, setTabs };
}
