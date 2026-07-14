import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  tip:     { label: "Tip",     border: "border-l-primary" },
  note:    { label: "Note",    border: "border-l-border" },
  warning: { label: "Heads up", border: "border-l-amber-500" },
} as const;

export function Callout({
  variant = "tip",
  children,
}: {
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
}) {
  const v = VARIANTS[variant];
  return (
    <div className={cn("border border-border border-l-2 bg-card px-4 py-3 my-4", v.border)}>
      <span
        className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {v.label}
      </span>
      <div className="text-sm text-foreground" style={{ fontFamily: "var(--font-body)" }}>
        {children}
      </div>
    </div>
  );
}
