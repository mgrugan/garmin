/**
 * The Trajectory — the deck's signature panel.
 *
 * Left of the "now" marker is recorded body mass: a solid platinum line, the
 * one series in the app rendered without editorial colour. Right of it is the
 * simulation: a dashed cyan path inside a filled cone that widens with the
 * horizon. The two are drawn in the same coordinate space and joined at the
 * seam, so the forecast reads as a continuation of the person's own line
 * rather than a separate claim pasted beside it.
 *
 * The cone is the point. A single forecast line is a promise no model can
 * keep; the band is the honest part of the picture, so it is the part that
 * gets the area fill and the animation.
 */

import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SimPoint } from "@/lib/model/weight";
import type { WeightRecord } from "@/lib/garmin/types";
import { mediumDate } from "@/lib/format";
import { kgUnit, toDisplayMass, type UnitSystem } from "@/lib/format";
import { rollingMean } from "@/lib/garmin/derive";
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

const MASS = "#c3d0e0";
const PROJ = "#45d6f5";

interface Row {
  /** Epoch ms. The axis is time-scaled: weigh-ins land ~5 a week while the
   *  simulation is daily, so index-based spacing would squash the recorded
   *  past against the projected future. */
  t: number;
  date: string;
  actual?: number;
  /** 7-day trend through the scale noise. */
  trend?: number;
  projected?: number;
  band?: [number, number];
  goal?: number;
}

export function TrajectoryChart({
  history,
  simulation,
  units,
  goalKg,
  height = 340,
}: {
  history: WeightRecord[];
  simulation: SimPoint[];
  units: UnitSystem;
  goalKg?: number;
  height?: number;
}) {
  const { rows, nowDate, domain } = useMemo(() => {
    const conv = (v: number) => toDisplayMass(v, units);

    // Scale data is noisy enough that the raw line hides the trend it is
    // supposed to show, so both are drawn: dots for truth, line for signal.
    const smoothed = rollingMean(
      history.map((w) => ({ date: w.date, value: w.weightKg })),
      7,
    );
    const trendByDate = new Map(smoothed.map((p) => [p.date, p.value]));

    const past: Row[] = history.map((w) => ({
      t: ms(w.date),
      date: w.date,
      actual: conv(w.weightKg),
      trend: conv(trendByDate.get(w.date) ?? w.weightKg),
    }));

    const future: Row[] = simulation.slice(1).map((p) => ({
      t: ms(p.date),
      date: p.date,
      projected: conv(p.weightKg),
      band: [conv(p.loKg), conv(p.hiKg)] as [number, number],
    }));

    // Seam: the first simulated point shares the last recorded date so the
    // dashed line starts exactly where the solid one ends.
    const seamDate = history.at(-1)?.date ?? simulation[0]?.date ?? "";
    const seamValue = conv(simulation[0]?.weightKg ?? history.at(-1)?.weightKg ?? 0);
    const merged = [...past];
    const seamRow = merged.find((r) => r.date === seamDate);
    if (seamRow) {
      seamRow.projected = seamValue;
      seamRow.band = [seamValue, seamValue];
    }
    merged.push(...future);

    const all = merged.flatMap((r) => [r.actual, r.projected, r.band?.[0], r.band?.[1]])
      .filter((v): v is number => v !== undefined);
    const lo = Math.min(...all, goalKg ? conv(goalKg) : Infinity);
    const hi = Math.max(...all, goalKg ? conv(goalKg) : -Infinity);
    const pad = Math.max(0.6, (hi - lo) * 0.12);

    return {
      rows: merged,
      nowDate: seamDate,
      domain: [Math.floor(lo - pad), Math.ceil(hi + pad)] as [number, number],
    };
  }, [history, simulation, units, goalKg]);

  const unit = kgUnit(units);

  return (
    <div className="flex flex-col gap-3">
      <ChartBox height={height}>
        <ResponsiveContainer width="100%" height="100%">
          {/* Right margin clears the final x tick and the goal-line label,
              both of which sit hard against the plot edge. */}
          <ComposedChart data={rows} margin={{ top: 8, right: 30, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PROJ} stopOpacity={0.22} />
                <stop offset="100%" stopColor={PROJ} stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <Grid />
            <TimeScaleAxis formatter={tickDate} />
            <ValueAxis domain={domain} width={44} formatter={(v) => v.toFixed(0)} />

            {/* Uncertainty first, so every line sits on top of it. */}
            <Area
              dataKey="band"
              stroke="none"
              fill="url(#cone)"
              isAnimationActive={false}
              connectNulls
            />

            {goalKg !== undefined && (
              <ReferenceLine
                y={toDisplayMass(goalKg, units)}
                stroke="#b8f23c"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `GOAL ${toDisplayMass(goalKg, units).toFixed(1)}`,
                  position: "insideTopRight",
                  fill: "#b8f23c",
                  fontSize: 9,
                  fontFamily: "JetBrains Mono Variable, monospace",
                  letterSpacing: "0.12em",
                }}
              />
            )}

            <ReferenceLine
              x={ms(nowDate)}
              stroke="#2c3846"
              strokeWidth={1}
              label={{
                value: "NOW",
                position: "insideTopLeft",
                fill: "#77859a",
                fontSize: 9,
                fontFamily: "JetBrains Mono Variable, monospace",
                letterSpacing: "0.16em",
              }}
            />

            {/* Raw weigh-ins, deliberately faint — the trend is the signal. */}
            <Line
              dataKey="actual"
              stroke={MASS}
              strokeOpacity={0.28}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="trend"
              stroke={MASS}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="projected"
              stroke={PROJ}
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />

            <Tooltip
              cursor={{ stroke: "#2c3846", strokeWidth: 1 }}
              content={(p: RechartsTooltipProps) => <TrajectoryTooltip {...p} unit={unit} />}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>

      <Legend
        items={[
          { label: "Recorded", color: MASS },
          { label: "Projected", color: PROJ, dashed: true },
          { label: "95% range", color: "#2b6c7e" },
        ]}
      />
    </div>
  );
}

function TrajectoryTooltip({ active, payload, unit }: RechartsTooltipProps & { unit: string }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;

  const rows = [];
  if (row.actual !== undefined) {
    rows.push({ label: "Weighed", value: `${row.actual.toFixed(1)} ${unit}`, color: MASS });
  }
  if (row.trend !== undefined) {
    rows.push({ label: "7-day trend", value: `${row.trend.toFixed(1)} ${unit}`, color: MASS });
  }
  if (row.projected !== undefined && row.actual === undefined) {
    rows.push({
      label: "Projected",
      value: `${row.projected.toFixed(1)} ${unit}`,
      color: PROJ,
      projected: true,
    });
    if (row.band) {
      rows.push({
        label: "Likely range",
        value: `${row.band[0].toFixed(1)}–${row.band[1].toFixed(1)}`,
        color: "#2b6c7e",
      });
    }
  }

  return <TooltipCard title={mediumDate(row.date)} rows={rows} />;
}

/** Local midnight for an ISO day, so the axis never shifts a point across a
 *  date boundary in negative-offset time zones. */
function ms(iso: string): number {
  return Date.parse(`${iso}T00:00:00`);
}
