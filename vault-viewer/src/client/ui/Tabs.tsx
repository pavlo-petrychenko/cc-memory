import type { HTMLAttributes } from "react";

type TabsProps = HTMLAttributes<HTMLDivElement> & {
  activeId?: string;
};

export function Tabs({ children, activeId, ...props }: TabsProps): JSX.Element {
  return (
    <div
      {...props}
      className={`tabs ${props.className ?? ""}`.trim()}
      data-active={activeId}
    >
      {children}
    </div>
  );
}

export function TabsList({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...props}
      className={`tabs-list ${props.className ?? ""}`.trim()}
      role="tablist"
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: "2px",
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}

type TabsTriggerProps = HTMLAttributes<HTMLDivElement> & {
  isActive?: boolean;
};

export function TabsTrigger({
  isActive,
  children,
  ...props
}: TabsTriggerProps): JSX.Element {
  return (
    <div
      {...props}
      role="tab"
      aria-selected={isActive}
      className={`tabs-trigger ${isActive ? "is-active" : ""} ${props.className ?? ""}`.trim()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "0 10px",
        fontSize: "12px",
        background: isActive ? "var(--bg)" : "var(--panel)",
        color: isActive ? "var(--text)" : "var(--muted)",
        borderRight: "1px solid var(--border)",
        borderTop: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}

export function TabsContent({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div {...props} className={`tabs-content ${props.className ?? ""}`.trim()}>
      {children}
    </div>
  );
}
