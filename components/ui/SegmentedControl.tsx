import { cn } from "@/lib/utils";

export default function SegmentedControl<T extends string>({
  options,
  active,
  onChange,
  size = "default",
}: {
  options: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
  size?: "default" | "sm";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]";
  return (
    <div className="inline-flex border border-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "font-bold tracking-[0.08em] uppercase transition-colors cursor-pointer",
            pad,
            o.key === active
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          )}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
