import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { Tab } from "../../types/tabs.js";

type TabsContextValue = {
  tabs: Tab[];
  activePath: string;
  openPath: (p: string) => void;
  closeTab: (p: string) => void;
  setActivePath: (p: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function TabsProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`tabs:${workspaceId}`) ?? "[]");
    } catch {
      return [];
    }
  });
  const [activePath, setActivePath] = useState<string>("");

  useEffect(() => {
    if (workspaceId) localStorage.setItem(`tabs:${workspaceId}`, JSON.stringify(tabs));
  }, [tabs, workspaceId]);

  const openPath = useCallback((p: string) => {
    setTabs((prev) => {
      if (prev.some((t) => t.relPath === p)) return prev;
      const title = p.split("/").pop()?.replace(".md", "") ?? p;
      return [...prev, { relPath: p, title }];
    });
    setActivePath(p);
  }, []);

  const closeTab = useCallback(
    (p: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.relPath === p);
        const next = prev.filter((t) => t.relPath !== p);
        if (p === activePath) {
          const fallback = next[idx] ?? next[idx - 1] ?? next[0];
          if (fallback) setActivePath(fallback.relPath);
          else setActivePath("");
        }
        return next;
      });
    },
    [activePath],
  );

  return (
    <TabsContext.Provider value={{ tabs, activePath, openPath, closeTab, setActivePath }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within TabsProvider");
  return ctx;
}
