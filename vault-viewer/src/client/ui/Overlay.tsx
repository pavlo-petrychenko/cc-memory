import type { HTMLAttributes } from "react";

type OverlayProps = HTMLAttributes<HTMLDivElement> & {
  onClose?: () => void;
};

export function Overlay({ onClose, children, ...props }: OverlayProps): JSX.Element {
  return (
    <div
      {...props}
      className={`overlay ${props.className ?? ""}`.trim()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
        props.onClick?.(e);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 30,
        display: "grid",
        placeItems: "start center",
        paddingTop: "80px",
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}
