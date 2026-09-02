import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useElementWidth } from "./useElementWidth";

/** One game the plotted team plated on a given point's date. */
export type ResultTick = {
  pointIndex: number;
  outcome: "W" | "L" | "T";
  label: string;
};

export type ChartGeometry = {
  width: number;
  height: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  /** Pixel x of point i. */
  x: (i: number) => number;
  /** Pixel y of a 0-100 value. */
  y: (v: number) => number;
};

/**
 * Split indices into runs of consecutive valid points, so a failed point breaks
 * the line instead of being interpolated across.
 */
export function contiguousSegments(valid: boolean[]): number[][] {
  const out: number[][] = [];
  let run: number[] = [];
  valid.forEach((ok, i) => {
    if (ok) {
      run.push(i);
    } else if (run.length) {
      out.push(run);
      run = [];
    }
  });
  if (run.length) out.push(run);
  return out;
}

const MARGIN = { top: 10, right: 10, bottom: 26, left: 34 };
const TICK_ROW_HEIGHT = 14;
const MIN_LABEL_SPACING = 46;

const OUTCOME_COLOR: Record<ResultTick["outcome"], string> = {
  W: "var(--success)",
  L: "var(--destructive)",
  T: "var(--muted-foreground)",
};

/**
 * Shared axes, gridlines, hover band and tooltip for the timeline charts.
 * Geometry is computed in real pixels against the measured container width —
 * see useElementWidth for why this isn't a scaled viewBox.
 */
export default function ChartFrame({
  labels,
  height = 200,
  results,
  yLabels = [0, 25, 50, 75, 100],
  emphasizeY,
  tooltip,
  children,
}: {
  labels: string[];
  height?: number;
  results?: ResultTick[];
  /** 0-100 values to label and rule on the y axis. */
  yLabels?: number[];
  /** A y value drawn as a stronger reference line (e.g. 50%). */
  emphasizeY?: number;
  /** Tooltip body for the hovered point index. */
  tooltip?: (index: number) => React.ReactNode;
  children: (geom: ChartGeometry) => React.ReactNode;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const hasTicks = !!results && results.length > 0;
  const bottom = MARGIN.bottom + (hasTicks ? TICK_ROW_HEIGHT : 0);

  const geom = useMemo<ChartGeometry>(() => {
    const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
    const plotHeight = Math.max(1, height - MARGIN.top - bottom);
    const n = labels.length;
    return {
      width,
      height,
      plotLeft: MARGIN.left,
      plotTop: MARGIN.top,
      plotWidth,
      plotHeight,
      x: (i: number) => MARGIN.left + (n <= 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth),
      y: (v: number) => MARGIN.top + (1 - Math.max(0, Math.min(100, v)) / 100) * plotHeight,
    };
  }, [width, height, bottom, labels.length]);

  // Thin x labels until they stop colliding on narrow screens.
  const labelStep = useMemo(() => {
    if (labels.length <= 1) return 1;
    const spacing = geom.plotWidth / (labels.length - 1);
    return Math.max(1, Math.ceil(MIN_LABEL_SPACING / Math.max(spacing, 1)));
  }, [geom.plotWidth, labels.length]);

  const ticksByPoint = useMemo(() => {
    const m = new Map<number, ResultTick[]>();
    for (const t of results ?? []) {
      const list = m.get(t.pointIndex);
      if (list) list.push(t);
      else m.set(t.pointIndex, [t]);
    }
    return m;
  }, [results]);

  const axisY = geom.plotTop + geom.plotHeight;
  // Keep the tooltip inside the container by flipping it near the right edge.
  const tooltipOnLeft = hovered !== null && geom.x(hovered) > width * 0.6;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        className="block select-none"
        role="img"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Gridlines + y labels */}
        <g className="text-border">
          {yLabels.map((v) => (
            <line
              key={v}
              x1={geom.plotLeft}
              x2={geom.plotLeft + geom.plotWidth}
              y1={geom.y(v)}
              y2={geom.y(v)}
              stroke="currentColor"
              strokeWidth={1}
              opacity={v === emphasizeY ? 1 : 0.5}
              strokeDasharray={v === emphasizeY ? "3 3" : undefined}
            />
          ))}
        </g>
        <g className="text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: 9 }}>
          {yLabels.map((v) => (
            <text key={v} x={geom.plotLeft - 6} y={geom.y(v) + 3} textAnchor="end" fill="currentColor">
              {v}%
            </text>
          ))}
        </g>

        {/* Series */}
        {children(geom)}

        {/* Hover guide */}
        {hovered !== null && (
          <line
            x1={geom.x(hovered)}
            x2={geom.x(hovered)}
            y1={geom.plotTop}
            y2={axisY}
            stroke="currentColor"
            className="text-foreground"
            strokeWidth={1}
            opacity={0.35}
          />
        )}

        {/* X axis */}
        <line
          x1={geom.plotLeft}
          x2={geom.plotLeft + geom.plotWidth}
          y1={axisY}
          y2={axisY}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />

        {/* Win/loss ticks for the plotted team's own games */}
        {hasTicks && (
          <g>
            {labels.map((_, i) => {
              const ticks = ticksByPoint.get(i);
              if (!ticks?.length) return null;
              const cx = geom.x(i);
              const w = 4;
              const gap = 2;
              const total = ticks.length * w + (ticks.length - 1) * gap;
              return ticks.map((t, k) => (
                <rect
                  key={`${i}-${k}`}
                  x={cx - total / 2 + k * (w + gap)}
                  y={axisY + 4}
                  width={w}
                  height={6}
                  fill={OUTCOME_COLOR[t.outcome]}
                />
              ));
            })}
          </g>
        )}

        {/* X labels */}
        <g className="text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: 9 }}>
          {labels.map((label, i) => {
            const last = labels.length - 1;
            const isEdge = i === 0 || i === last;
            if (!isEdge && i % labelStep !== 0) return null;
            // The final label is always drawn, so drop any that would run into it.
            if (!isEdge && geom.x(last) - geom.x(i) < MIN_LABEL_SPACING) return null;
            return (
              <text
                key={i}
                x={geom.x(i)}
                y={axisY + (hasTicks ? TICK_ROW_HEIGHT : 0) + 15}
                textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
                fill="currentColor"
              >
                {label}
              </text>
            );
          })}
        </g>

        {/* Hover bands, last so they sit on top */}
        <g>
          {labels.map((_, i) => {
            const half = labels.length <= 1 ? geom.plotWidth / 2 : geom.plotWidth / (labels.length - 1) / 2;
            const left = Math.max(geom.plotLeft, geom.x(i) - half);
            const right = Math.min(geom.plotLeft + geom.plotWidth, geom.x(i) + half);
            return (
              <rect
                key={i}
                x={left}
                y={geom.plotTop}
                width={Math.max(1, right - left)}
                height={geom.plotHeight + (hasTicks ? TICK_ROW_HEIGHT : 0)}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onTouchStart={() => setHovered(i)}
              />
            );
          })}
        </g>
      </svg>

      {hovered !== null && tooltip && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 border border-border bg-popover text-popover-foreground",
            "px-2 py-1.5 text-[10px] shadow-sm max-w-[190px]"
          )}
          style={{
            fontFamily: "var(--font-body)",
            top: MARGIN.top,
            left: tooltipOnLeft ? undefined : Math.min(geom.x(hovered) + 8, width - 8),
            right: tooltipOnLeft ? Math.max(width - geom.x(hovered) + 8, 8) : undefined,
          }}
        >
          {tooltip(hovered)}
        </div>
      )}
    </div>
  );
}
