import SegmentedControl from "@/components/ui/SegmentedControl";

export type StandingsMode = "current" | "live" | "as-of";

const MODE_OPTIONS: { key: StandingsMode; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "live", label: "Live" },
  { key: "as-of", label: "As-of" },
];

export default function StandingsModeToggle({
  mode,
  onModeChange,
  asOfDate,
  onAsOfDateChange,
  minDate,
  maxDate,
}: {
  mode: StandingsMode;
  onModeChange: (mode: StandingsMode) => void;
  asOfDate: string;
  onAsOfDateChange: (date: string) => void;
  minDate: string | null;
  maxDate: string | null;
}) {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SegmentedControl<StandingsMode>
        options={MODE_OPTIONS}
        active={mode}
        onChange={onModeChange}
        size="sm"
      />
      {mode === "as-of" && (
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => onAsOfDateChange(e.target.value)}
          min={minDate ?? undefined}
          max={maxDate && maxDate < today ? maxDate : today}
          className="border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        />
      )}
    </div>
  );
}
