import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`border-border bg-card rounded-xl border p-6 ${className}`} {...props} />;
}
