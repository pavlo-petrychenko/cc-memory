import { useEffect } from "react";

/** Global ⌘K / Ctrl+K toggles the palette; Escape closes it. */
export function usePaletteShortcut(
  isOpen: boolean,
  onToggle: () => void,
  onClose: () => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggle();
      }
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onToggle, onClose]);
}
