import { useEffect, useState } from "react";

type MermaidState = {
  svg: string;
  error: string | null;
};

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function getMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
}

export function useMermaid(code: string): MermaidState {
  const [state, setState] = useState<MermaidState>({ svg: "", error: null });

  useEffect(() => {
    let cancelled = false;
    const trimmed = code.trim();
    if (!trimmed) {
      setState({ svg: "", error: null });
      return;
    }

    getMermaid()
      .then((mermaid) => {
        const theme =
          document.documentElement.getAttribute("data-theme") === "light"
            ? "default"
            : "dark";
        mermaid.initialize({ startOnLoad: false, theme });
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        return mermaid.render(id, trimmed);
      })
      .then((result) => {
        if (!cancelled) setState({ svg: result.svg, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setState({ svg: "", error: msg });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return state;
}
