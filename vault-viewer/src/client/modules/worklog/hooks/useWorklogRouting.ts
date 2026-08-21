import type { WorklogSlugDto } from "@shared/contracts/tree.contract.js";
import { useEffect, useMemo } from "react";

const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.md$/;

function worklogSlugFor(activePath: string): string | null {
  if (activePath === "") return null;
  const slug = activePath.split("/")[0] ?? "";
  const isStateOrDate =
    activePath.endsWith("STATE.md") || DATE_FILE.test(activePath.split("/").pop() ?? "");
  if (!isStateOrDate) return null;
  return slug;
}

/** Decides whether `activePath` points into a worklog tree rather than a KB
 * note, and — when it does — focuses that slug in note mode. */
export function useWorklogRouting(
  activePath: string,
  worklogs: readonly WorklogSlugDto[],
  onWorklogFocus: (slug: string) => void,
  onEnterNoteMode: () => void,
): boolean {
  const slug = useMemo(() => worklogSlugFor(activePath), [activePath]);
  const isWorklogTimeline = useMemo(
    () => slug !== null && worklogs.some((w) => w.slug === slug),
    [slug, worklogs],
  );

  useEffect(() => {
    if (!activePath || !isWorklogTimeline || slug === null) return;
    onWorklogFocus(slug);
    onEnterNoteMode();
  }, [activePath, isWorklogTimeline, slug, onWorklogFocus, onEnterNoteMode]);

  return isWorklogTimeline;
}
