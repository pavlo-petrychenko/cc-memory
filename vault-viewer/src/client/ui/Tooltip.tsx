import type { HTMLAttributes, ReactNode } from "react";

type TooltipProps = HTMLAttributes<HTMLSpanElement> & {
  content: ReactNode;
};

export function Tooltip({ content, children, ...props }: TooltipProps): JSX.Element {
  return (
    <span
      {...props}
      className={`tooltip-wrap ${props.className ?? ""}`.trim()}
      style={{ position: "relative", display: "inline-flex", ...props.style }}
    >
      {children}
      <span
        className="tooltip"
        role="tooltip"
        style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: "4px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,.3)",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        {content}
      </span>
    </span>
  );
}
