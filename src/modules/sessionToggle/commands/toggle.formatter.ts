/** The toggle command's exact output lines — agent-visible text, changed
 * deliberately only. */

export class ToggleFormatter {
  offLine(sessionId: string): string {
    return `cc-memory off for session ${sessionId}`;
  }

  onLine(sessionId: string): string {
    return `cc-memory on for session ${sessionId}`;
  }

  statusLine(sessionId: string, enabled: boolean): string {
    return enabled
      ? `cc-memory is on for session ${sessionId}`
      : `cc-memory is off for session ${sessionId}`;
  }

  missingSessionId(): string {
    return (
      "no session id: pass --session ID, or run inside Claude Code where " +
      "$CLAUDE_CODE_SESSION_ID is set"
    );
  }

  unsafeSessionId(sessionId: string): string {
    return `refusing unsafe session id '${sessionId}' (allowed: letters, digits, dot, dash, underscore)`;
  }
}
