import type { HTMLAttributes } from "react";

export function Badge({ children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} className={`badge ${props.className ?? ""}`.trim()}>
      {children}
    </span>
  );
}
