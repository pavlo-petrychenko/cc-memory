import type { WorkspaceDto } from "@shared/contracts/workspace.contract.js";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { listWorkspaces } from "../../services/api/workspaces.api.js";
import { qk } from "../../services/query/queryKeys.js";

const WorkspaceContext = createContext<{
  workspaces: WorkspaceDto[];
  activeWs: string;
  setActiveWs: (id: string) => void;
  isLoading: boolean;
} | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.workspaces(),
    queryFn: ({ signal }) => listWorkspaces(signal),
  });
  const workspaces = data?.workspaces ?? [];
  const [activeWs, setActiveWs] = useState<string>("");

  useEffect(() => {
    if (!activeWs && workspaces[0]?.id) setActiveWs(workspaces[0].id);
  }, [activeWs, workspaces]);

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWs, setActiveWs, isLoading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): {
  workspaces: WorkspaceDto[];
  activeWs: string;
  setActiveWs: (id: string) => void;
  isLoading: boolean;
} {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
