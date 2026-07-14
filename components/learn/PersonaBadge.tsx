import { PERSONA_LABELS, type LearnPersona } from "@/lib/learn/registry";
import { cn } from "@/lib/utils";

export function PersonaBadge({
  persona,
  active,
  onClick,
}: {
  persona: LearnPersona;
  active?: boolean;
  onClick?: () => void;
}) {
  const cls = cn(
    "inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] border transition-colors duration-100",
    active
      ? "bg-primary text-primary-foreground border-primary"
      : "border-border text-muted-foreground",
    onClick && !active && "hover:border-primary/50 hover:text-foreground cursor-pointer",
    onClick && "cursor-pointer"
  );
  const label = PERSONA_LABELS[persona];
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={{ fontFamily: "var(--font-body)" }}>
        {label}
      </button>
    );
  }
  return (
    <span className={cls} style={{ fontFamily: "var(--font-body)" }}>
      {label}
    </span>
  );
}
