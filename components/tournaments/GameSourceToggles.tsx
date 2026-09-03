import { ALL_GAME_SOURCES, GAME_SOURCE_LABELS, type GameSource } from "@/lib/teams/gameSources";
import { cn } from "@/lib/utils";

/**
 * Which game sources feed the records shown on screen — and, on the tournament
 * tabs, the strength estimates a prediction is built from. The last active
 * source can't be turned off: an empty selection would leave nothing to
 * compute from.
 */
export default function GameSourceToggles({
  value,
  onToggle,
  label = "Record from",
}: {
  value: GameSource[];
  onToggle: (source: GameSource) => void;
  label?: string | null;
}) {
  const isLastActive = (source: GameSource) => value.length === 1 && value.includes(source);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {label && (
        <span className="label-section shrink-0" style={{ fontFamily: "var(--font-body)" }}>
          {label}
        </span>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {ALL_GAME_SOURCES.map((source) => {
          const active = value.includes(source);
          const locked = isLastActive(source);
          return (
            <button
              key={source}
              type="button"
              aria-pressed={active}
              disabled={locked}
              title={locked ? "At least one source must stay selected" : undefined}
              onClick={() => onToggle(source)}
              className={cn(
                "px-2.5 py-1 text-[11px] border transition-colors duration-100 leading-none",
                active
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-border bg-input-bg text-muted-foreground hover:border-primary/60 hover:text-foreground",
                locked && "cursor-default opacity-90"
              )}
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
            >
              {GAME_SOURCE_LABELS[source]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
