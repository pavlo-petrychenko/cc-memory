import { useCallback } from "react";
import type { NoteMetaDto } from "@shared/contracts/tree.contract.js";

export type ResolveWikilink = (target: string, newTab: boolean) => void;

/**
 * Pure resolver: mirrors the legacy handleWikilink but as a hook with stable identity.
 * Resolution order:
 * 1) exact title match (case-insensitive)
 * 2) exact relPath lower-case match `${target}.md`
 * 3) fallback to `${target}.md` as unresolved tab (caller will show 404)
 *
 * This single resolver replaces the triplicated logic in parser / server backlinks / old App.
 */
export function useWikilink(
  notesMeta: readonly NoteMetaDto[],
  openPath: (path: string, newTab?: boolean) => void,
): ResolveWikilink {
  return useCallback(
    (target: string, newTab: boolean): void => {
      const byTitle = notesMeta.find((n) => n.title.toLowerCase() === target.toLowerCase());
      const direct = notesMeta.find((n) => n.relPath.toLowerCase() === `${target.toLowerCase()}.md`);
      if (direct) {
        openPath(direct.relPath, newTab);
        return;
      }
      if (byTitle) {
        openPath(byTitle.relPath, newTab);
        return;
      }
      openPath(`${target}.md`, newTab);
    },
    [notesMeta, openPath],
  );
}
