import type { TabDto } from "@shared/contracts/tabs.contract.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type TabsContextValue = {
  tabs: TabDto[];
  activePath: string;
  openPath: (p: string) => void;
  closeTab: (p: string) => void;
  setActivePath: (p: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

const tabKey = (workspaceId: string): string => `tabs:${workspaceId}`;

function loadTabs(workspaceId: string): TabDto[] {
  try {
    const raw = localStorage.getItem(tabKey(workspaceId));
    if (!raw) return [];
    // SAFETY: persisted state written by this provider is a JSON array of tabs;
    // malformed user-edited entries degrade to an empty tab strip, not a crash.
    const parsed = JSON.parse(raw) as TabDto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Owns the per-workspace open-tab strip. Remount via `key={workspaceId}` when
 * the workspace changes — state intentionally re-initializes from that
 * workspace's persisted tabs instead of leaking one workspace's strip into
 * another's storage key. */
export function TabsProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [tabs, setTabs] = useState<TabDto[]>(() => loadTabs(workspaceId));
  const [activePath, setActivePath] = useState<string>("");

  useEffect(() => {
    if (workspaceId) localStorage.setItem(tabKey(workspaceId), JSON.stringify(tabs));
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
