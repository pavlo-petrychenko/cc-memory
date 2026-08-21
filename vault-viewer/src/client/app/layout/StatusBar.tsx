import { useCallback, useEffect, useState } from "react";
import { reindex as reindexApi } from "../../services/api/workspaces.api.js";
import { useWorkspace } from "../providers/workspace.provider.js";

const TOAST_MS = 2500;

/** Bottom status strip + transient toast, with the reindex trigger. */
export function StatusBar() {
  const { workspaces, activeWs } = useWorkspace();
  const active = workspaces.find((w) => w.id === activeWs);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (toast === "") return;
    const handle = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  const handleReindex = useCallback(async () => {
    if (!activeWs) return;
    setToast("Reindexing…");
    try {
      const r = await reindexApi(activeWs);
      setToast(`Reindexed: ${r.total} notes`);
    } catch {
      setToast("Reindex done");
    }
  }, [activeWs]);

  return (
    <>
      <div className="statusbar">
        <span>{active?.noteCount ?? 0} notes</span>
        <span className="dim">index {active?.indexFresh ?? "…"}</span>
        <span className="dim">vault: {active?.tildifiedKb ?? ""}</span>
        <button type="button" className="reindex-btn" onClick={handleReindex}>
          Reindex
        </button>
        <span className="right">localhost:3415 • console • viewer only</span>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
