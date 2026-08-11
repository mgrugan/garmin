/**
 * Generic measured-plus-projected line, used for every scalar metric
 * (VO₂max, resting HR, HRV, sleep score).
 *
 * The projection is drawn only when `fitTrend` produced something meaningful —
 * see `isTrendMeaningful`. Extrapolating a slope smaller than its own residual
 * noise produces a confident-looking line that means nothing, which is the
 * most common way a fitness dashboard misleads.
 */

import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts";
import type { ForecastPoint } from "@/lib/model/forecast";
import { mediumDate } from "@/lib/format";
import {
  ChartBox,
  Grid,
  Legend,
  TimeScaleAxis,
  TooltipCard,
  ValueAxis,
  tickDate,
  type RechartsTooltipProps,
} from "./chart-kit";

interface Row {
  /** Epoch ms — the axis is time-scaled, so position comes from this, not the index. */
  t: number;
  date: string;
  value: number | null;
  projected: number | null;
  band?: [number, number];
}

export function MetricTrendChart({
  points,
  color,
  unit,
  dp = 1,
  height = 200,
  showProjection = true,
  seamDate,
  invertBetter = false,
}: {
  points: ForecastPoint[];
  color: string;
  unit: string;
  dp?: number;
  height?: number;
  showProjection?: boolean;
  seamDate?: string;
  /** Only affects the legend wording; lower is better for RHR and weight. */
  invertBetter?: boolean;
}) {
  const { rows, domain } = useMemo(() => {
    const rows: Row[] = points.map((p) => ({
      t: Date.parse(`${p.date}T00:00:00`),
      date: p.date,
      value: p.value,
      projected: showProjection ? p.projected : null,
      band:
        showProjection && p.lo !== null && p.hi !== null
          ? ([p.lo, p.hi] as [number, number])
          : undefined,
    }));

    const all = rows
      .flatMap((r) => [r.value, r.projected, r.band?.[0], r.band?.[1]])
      .filter((v): v is number => v !== null && v !== undefined);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = Math.max(0.5, (hi - lo) * 0.14);

    return { rows, domain: [lo - pad, hi + pad] as [number, number] };
  }, [points, showProjection]);

  const gradientId = useMemo(() => `cone-${color.replace("#", "")}`, [color]);

  return (
    <div className="flex flex-col gap-2.5">
      <ChartBox height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 22, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            <Grid />
            <TimeScaleAxis formatter={tickDate} />
            <ValueAxis
              domain={domain}
              width={38}
              formatter={(v) => (dp === 0 ? String(Math.round(v)) : v.toFixed(dp))}
            />

            {showProjection && (
              <Area
                dataKey="band"
                stroke="none"
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {seamDate && (
              <ReferenceLine
                x={Date.parse(`${seamDate}T00:00:00`)}
                stroke="#2c3846"
                strokeWidth={1}
              />
            )}

            <Line
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            {showProjection && (
              <Line
                dataKey="projected"
                stroke={color}
                strokeWidth={1.75}
                strokeDasharray="4 4"
                strokeLinecap="round"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            <Tooltip
              cursor={{ stroke: "#2c3846", strokeWidth: 1 }}
              content={(p: RechartsTooltipProps) => (
                <TrendTooltip {...p} unit={unit} dp={dp} color={color} />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>

      {showProjection && (
        <Legend
          items={[
            { label: "Measured", color },
            { label: invertBetter ? "Projected (lower is better)" : "Projected", color, dashed: true },
          ]}
        />
      )}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  unit,
  dp,
  color,
}: RechartsTooltipProps & { unit: string; dp: number; color: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;

  const rows = [];
  if (row.value !== null && row.value !== undefined) {
    rows.push({ label: "Measured", value: `${row.value.toFixed(dp)} ${unit}`, color });
  } else if (row.projected !== null && row.projected !== undefined) {
    rows.push({
      label: "Projected",
      value: `${row.projected.toFixed(dp)} ${unit}`,
      color,
      projected: true,
    });
    if (row.band) {
      rows.push({
        label: "Likely range",
        value: `${row.band[0].toFixed(dp)}–${row.band[1].toFixed(dp)}`,
      });
    }
  }

  return <TooltipCard title={mediumDate(row.date)} rows={rows} />;
}


/* ── sparkline ──────────────────────────────────────────────────────────── */

/**
 * Inline trend for stat tiles. Hand-drawn SVG rather than a charting component:
 * at 28px tall, Recharts' axis machinery costs more than the mark it renders,
 * and these appear a dozen at a time.
 */
export function Sparkline({
  values,
  color,
  height = 28,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2) return <div style={{ height }} />;

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const w = 100;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - 2 - ((v - lo) / span) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
      />
    </svg>
  );
}
