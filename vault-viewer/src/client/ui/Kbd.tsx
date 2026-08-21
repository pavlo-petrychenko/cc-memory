import type { HTMLAttributes } from "react";

export function Kbd({ children, ...props }: HTMLAttributes<HTMLElement>): JSX.Element {
  return (
    <kbd
      {...props}
      className={`kbd ${props.className ?? ""}`.trim()}
      style={{
        background: "var(--panel2)",
        border: "1px solid var(--border)",
        padding: "1px 5px",
        borderRadius: "3px",
        fontSize: "10px",
        fontFamily: "Fragment Mono",
        ...props.style,
      }}
    >
      {children}
    </kbd>
  );
}
