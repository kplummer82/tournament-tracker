import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

/**
 * Run / clear a tournament projection. Amber throughout, matching the bracket
 * prediction affordance on the season playoffs tab, so projected content never
 * reads as a real result.
 */
export default function PredictTournamentButton({
  active,
  loading,
  disabled,
  disabledReason,
  onPredict,
  onClear,
}: {
  active: boolean;
  loading: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onPredict: () => void;
  onClear: () => void;
}) {
  if (active) {
    return (
      <button
        type="button"
        onClick={onClear}
        className={cn(BTN_BASE, "border-border text-muted-foreground hover:bg-muted")}
        style={{ fontFamily: "var(--font-body)" }}
      >
        <X className="h-3 w-3" />
        Clear
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPredict}
      disabled={loading || disabled}
      title={disabled ? disabledReason : undefined}
      className={cn(
        BTN_BASE,
        "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 disabled:opacity-40"
      )}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {loading ? "Predicting…" : "Predict Tournament"}
    </button>
  );
}

/** The amber strip that explains what is being shown while a projection is active. */
export function PredictionBanner({
  projectedGamesCount,
  warning,
  children,
}: {
  projectedGamesCount: number;
  warning?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 p-2 mb-3">
      <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p>
          <span className="font-semibold uppercase tracking-wider">Projected</span> ·{" "}
          {projectedGamesCount === 0
            ? "all pool games are complete — showing actual results"
            : `${projectedGamesCount} unplayed pool game${projectedGamesCount !== 1 ? "s" : ""} simulated with Pythagorean expectation`}
          . Nothing here is saved.
        </p>
        {children}
        {warning && (
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>{warning}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Small marker for an individual projected value. */
export function ProjectedPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block px-1 py-px text-[8px] font-bold tracking-[0.1em] uppercase border border-amber-500/60 text-amber-600 dark:text-amber-400",
        className
      )}
      style={{ fontFamily: "var(--font-display)" }}
    >
      Proj
    </span>
  );
}
