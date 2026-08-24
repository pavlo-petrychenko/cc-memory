/** The marker filename for a silenced session, kept distinct from arbitrary
 * directory content by its suffix. */
export function markerFileName(sessionId: string): string {
  return `${sessionId}.off`;
}

/** Session ids become filename segments, so only unambiguous safe characters
 * are accepted — anything else is treated as "no session", never written. */
export function isSafeSessionId(sessionId: string): boolean {
  return (
    /^[A-Za-z0-9._-]{1,128}$/.test(sessionId) && sessionId !== "." && sessionId !== ".."
  );
}
