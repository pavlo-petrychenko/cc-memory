import type { NoteMetaDto } from "@shared/contracts/tree.contract.js";
import { useMemo } from "react";

export function useKnownTargets(notesMeta: readonly NoteMetaDto[]): ReadonlySet<string> {
  return useMemo(() => {
    const s = new Set<string>();
    for (const n of notesMeta) {
      s.add(n.relPath.toLowerCase());
      s.add(n.relPath.replace(/\.md$/, "").toLowerCase());
      s.add(n.title.toLowerCase());
    }
    return s;
  }, [notesMeta]);
}
