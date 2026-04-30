type Segment = {
  label: string;
  value: number;
  color: string; // Tailwind bg class e.g. "bg-emerald-500"
};

type StatusBarProps = {
  segments: Segment[];
  showLegend?: boolean;
};

export default function StatusBar({ segments, showLegend = true }: StatusBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-muted" />
        {showLegend && (
          <p className="text-xs text-muted-foreground">No data</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="h-2 rounded-full overflow-hidden flex">
        {segments.map((seg) => {
          if (seg.value === 0) return null;
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.label}
              className={`${seg.color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${seg.value}`}
            />
          );
        })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${seg.color}`} />
              <span>{seg.label}</span>
              <span className="font-medium text-foreground">{seg.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
