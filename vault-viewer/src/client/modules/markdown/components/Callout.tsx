import type { ReactNode } from "react";

type CalloutProps = {
  type: "NOTE" | "WARNING";
  children: ReactNode;
};

export function Callout({ type, children }: CalloutProps) {
  const isWarning = type === "WARNING";
  return (
    <blockquote
      className={isWarning ? "callout callout-warning" : "callout callout-note"}
    >
      {children}
    </blockquote>
  );
}
