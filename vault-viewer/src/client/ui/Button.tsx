import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "subtle";

export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cls =
    variant === "primary"
      ? "btn btn-primary"
      : variant === "ghost"
        ? "btn btn-ghost"
        : "btn btn-subtle";
  return <button {...props} className={`${cls} ${props.className ?? ""}`.trim()} />;
}
