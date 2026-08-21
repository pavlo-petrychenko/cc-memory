import type { HTMLAttributes } from "react";

export function Card({ children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...props}
      className={`card ${props.className ?? ""}`.trim()}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        boxShadow: "0 2px 12px rgba(0,0,0,.2)",
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}
