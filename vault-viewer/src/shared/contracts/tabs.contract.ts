/** One open editor tab. Client-only UI state (persisted to localStorage, never
 * sent over the wire), but typed here so every shared shape has one owner. */
export type TabDto = {
  readonly relPath: string;
  readonly title: string;
};
