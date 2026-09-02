import React, { useMemo } from "react";
import ChartFrame, { contiguousSegments, type ResultTick } from "./ChartFrame";

export type StackSeries = {
  key: string;
  label: string;
  /** A CSS colour — use a var(), never a literal hex, so both themes work. */
  fill: string;
  opacity?: number;
  /** 0-100 per point. Null where the point failed. */
  values: (number | null)[];
};

/**
 * 100% stacked area across as-of dates — used for the distribution scenario
 * questions, where the point is watching the fan of possible outcomes collapse.
 * Bands stack from the bottom in the order given.
 */
export default function StackedAreaChart({
  points,
  series,
  results,
  height = 200,
  tooltip,
}: {
  points: { label: string }[];
  series: StackSeries[];
  results?: ResultTick[];
  height?: number;
  tooltip?: (index: number) => React.ReactNode;
}) {
  // A point is plottable only if at least one band has a value there.
  const valid = useMemo(
    () => points.map((_, i) => series.some((s) => s.values[i] != null)),
    [points, series]
  );
  const segments = useMemo(() => contiguousSegments(valid), [valid]);

  // Cumulative upper edge of each band, normalised so each point sums to 100.
  const cumulative = useMemo(() => {
    return points.map((_, i) => {
      const raw = series.map((s) => s.values[i] ?? 0);
      const total = raw.reduce((a, b) => a + b, 0);
      const scale = total > 0 ? 100 / total : 0;
      const tops: number[] = [];
      let acc = 0;
      for (const v of raw) {
        acc += v * scale;
        tops.push(acc);
      }
      return tops;
    });
  }, [points, series]);

  return (
    <ChartFrame labels={points.map((p) => p.label)} height={height} results={results} tooltip={tooltip}>
      {(g) => (
        <g>
          {series.map((s, si) =>
            segments.map((seg, gi) => {
              if (seg.length < 2) return null;
              const upper = seg.map((i) => `${g.x(i)},${g.y(cumulative[i][si])}`);
              const lower = [...seg]
                .reverse()
                .map((i) => `${g.x(i)},${g.y(si === 0 ? 0 : cumulative[i][si - 1])}`);
              return (
                <path
                  key={`${s.key}-${gi}`}
                  d={`M ${upper.join(" L ")} L ${lower.join(" L ")} Z`}
                  fill={s.fill}
                  opacity={s.opacity ?? 1}
                />
              );
            })
          )}

          {/* Thin separators keep adjacent bands readable when their tints are close. */}
          {series.slice(0, -1).map((s, si) =>
            segments.map((seg, gi) =>
              seg.length < 2 ? null : (
                <polyline
                  key={`${s.key}-sep-${gi}`}
                  points={seg.map((i) => `${g.x(i)},${g.y(cumulative[i][si])}`).join(" ")}
                  fill="none"
                  stroke="var(--card)"
                  strokeWidth={0.75}
                  opacity={0.6}
                />
              )
            )
          )}
        </g>
      )}
    </ChartFrame>
  );
}
