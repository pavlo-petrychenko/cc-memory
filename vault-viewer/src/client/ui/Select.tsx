import type { SelectHTMLAttributes } from "react";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <select
      {...props}
      className={`select ${props.className ?? ""}`.trim()}
      style={{
        background: "var(--panel2)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "4px 8px",
        fontSize: "12px",
        fontFamily: "Fragment Mono",
        ...props.style,
      }}
    />
  );
}
