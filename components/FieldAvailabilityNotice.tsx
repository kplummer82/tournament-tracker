import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Copy ───────────────────────────────────────────────────────────────────────
// Centralized so the disclaimer wording changes in exactly one place. A location
// in the directory says nothing about whether the field is actually free — booking
// happens with the host city or private owner, and we have no relationship there.

export const FIELD_AVAILABILITY_COPY = {
  scheduling:
    "Listing a field here does not reserve it. Arranging field availability is your responsibility — Stacked Bench has no booking integration or affiliation with host cities or field owners.",
  accepting:
    "Stacked Bench makes no representation about this field's availability. The team that posted this listing is responsible for securing it.",
} as const;

export type FieldAvailabilityVariant = keyof typeof FIELD_AVAILABILITY_COPY;

// ─── Notice ─────────────────────────────────────────────────────────────────────
// `block` mirrors the learn Callout's amber left border but at form scale.
// `inline` is a single muted line for page headers and dialog bodies.

export default function FieldAvailabilityNotice({
  variant = "scheduling",
  tone = "block",
  className,
}: {
  variant?: FieldAvailabilityVariant;
  tone?: "block" | "inline";
  className?: string;
}) {
  const text = FIELD_AVAILABILITY_COPY[variant];

  if (tone === "inline") {
    return (
      <p
        className={cn(
          "flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground",
          className
        )}
        style={{ fontFamily: "var(--font-body)" }}
      >
        <AlertTriangle className="h-3 w-3 shrink-0 mt-px text-amber-600 dark:text-amber-400" />
        <span>{text}</span>
      </p>
    );
  }

  return (
    <div
      className={cn(
        "border border-border border-l-2 border-l-amber-500 bg-card px-3 py-2",
        className
      )}
    >
      <span
        className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Field availability
      </span>
      <p
        className="text-xs leading-snug text-foreground"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {text}
      </p>
    </div>
  );
}
