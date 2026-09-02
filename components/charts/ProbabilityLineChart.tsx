import React, { useMemo } from "react";
import ChartFrame, { contiguousSegments, type ResultTick } from "./ChartFrame";

export type ProbabilityPoint = {
  label: string;
  /** 0-100. Null when the engine ruled the outcome impossible, or the point failed. */
  value: number | null;
  /** False when the engine's best-case check ruled the target out — a real elimination. */
  possible: boolean;
  /** True when this point's analysis failed and should break the line. */
  errored: boolean;
};

/**
 * A single probability plotted across as-of dates — used for the scalar scenario
 * questions ("can they finish top N?", "can they meet in round 1?").
 */
export default function ProbabilityLineChart({
  points,
  results,
  height = 200,
  tooltip,
}: {
  points: ProbabilityPoint[];
  results?: ResultTick[];
  height?: number;
  tooltip?: (index: number) => React.ReactNode;
}) {
  const valid = useMemo(() => points.map((p) => !p.errored), [points]);
  const segments = useMemo(() => contiguousSegments(valid), [valid]);
  // Elimination is monotone — once the best case can't reach the target, later
  // dates can't either — so shade from the first eliminated point to the end.
  const eliminatedFrom = useMemo(() => {
    const i = points.findIndex((p) => !p.errored && !p.possible);
    return i === -1 ? null : i;
  }, [points]);

  const valueAt = (i: number) => (points[i].possible ? points[i].value ?? 0 : 0);

  return (
    <ChartFrame
      labels={points.map((p) => p.label)}
      height={height}
      results={results}
      emphasizeY={50}
      tooltip={tooltip}
    >
      {(g) => {
        const baseline = g.plotTop + g.plotHeight;
        return (
          <g>
            {eliminatedFrom !== null && (
              <>
                <rect
                  x={g.x(eliminatedFrom)}
                  y={g.plotTop}
                  width={Math.max(0, g.plotLeft + g.plotWidth - g.x(eliminatedFrom))}
                  height={g.plotHeight}
                  fill="var(--destructive)"
                  opacity={0.08}
                />
                <text
                  x={g.x(eliminatedFrom) + 4}
                  y={g.plotTop + 10}
                  fill="var(--destructive)"
                  style={{ fontFamily: "var(--font-display)", fontSize: 8, letterSpacing: "0.08em" }}
                >
                  ELIMINATED
                </text>
              </>
            )}

            {segments.map((seg, si) => {
              const pts = seg.map((i) => `${g.x(i)},${g.y(valueAt(i))}`);
              const area =
                seg.length > 1
                  ? `M ${pts[0]} L ${pts.slice(1).join(" L ")} L ${g.x(seg[seg.length - 1])},${baseline} L ${g.x(seg[0])},${baseline} Z`
                  : null;
              return (
                <g key={si}>
                  {area && <path d={area} fill="var(--primary)" opacity={0.12} />}
                  {seg.length > 1 && (
                    <polyline
                      points={pts.join(" ")}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}

            {points.map((p, i) =>
              p.errored ? null : (
                <circle
                  key={i}
                  cx={g.x(i)}
                  cy={g.y(valueAt(i))}
                  r={3}
                  fill={p.possible ? "var(--primary)" : "var(--destructive)"}
                />
              )
            )}
          </g>
        );
      }}
    </ChartFrame>
  );
}
