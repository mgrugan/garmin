/**
 * The domain-specific charts: training load, weekly volume, heart-rate zones,
 * sleep architecture, and the TDEE split.
 *
 * These are grouped rather than split one-per-file because they share the same
 * tooltip and axis vocabulary and are always read together.
 */

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { LoadPoint, WeekSummary } from "@/lib/garmin/derive";
import { ZONE_DESCRIPTIONS, ZONE_NAMES } from "@/lib/garmin/derive";
import type { SleepRecord } from "@/lib/garmin/types";
import type { TdeeBreakdown } from "@/lib/model/energy";
import { compactNumber, decimalHours, hoursMinutes, km, mediumDate, type UnitSystem } from "@/lib/format";
import {
  ChartBox,
  Grid,
  Legend,
  TimeAxis,
  TooltipCard,
  ValueAxis,
  axisCommon,
  type RechartsTooltipProps,
} from "./chart-kit";
import { XAxis, YAxis } from "recharts";

const LOAD = "#b8f23c";
const RECOVERY = "#45d6f5";
const CARDIAC = "#ff6b6b";
const ENERGY = "#ffc46b";
const MASS = "#c3d0e0";

/* ── training load ──────────────────────────────────────────────────────── */

/**
 * Fitness (42-day load) against fatigue (7-day load).
 *
 * The shaded band marks the 0.8–1.3 acute:chronic ratio where training builds
 * without the injury-risk penalty. Drawing the safe zone rather than the danger
 * zone keeps the chart legible when everything is fine, which is most of the time.
 */
export function LoadChart({ data, height = 240 }: { data: LoadPoint[]; height?: number }) {
  const rows = useMemo(
    () =>
      data.map((p) => ({
        date: p.date,
        acute: Math.round(p.acute * 10) / 10,
        chronic: Math.round(p.chronic * 10) / 10,
        ratio: Math.round(p.ratio * 100) / 100,
      })),
    [data],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <ChartBox height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 22, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id="chronicFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={RECOVERY} stopOpacity={0.18} />
                <stop offset="100%" stopColor={RECOVERY} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Grid />
            <TimeAxis formatter={shortLabel} />
            <ValueAxis width={34} formatter={(v) => compactNumber(v)} />

            <Area
              dataKey="chronic"
              stroke={RECOVERY}
              strokeWidth={2}
              fill="url(#chronicFill)"
              isAnimationActive={false}
            />
            <Line
              dataKey="acute"
              stroke={LOAD}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />

            <Tooltip
              cursor={{ stroke: "#2c3846", strokeWidth: 1 }}
              content={(p: RechartsTooltipProps) => {
                if (!p.active || !p.payload?.length || typeof p.label !== "string") return null;
                const r = p.payload[0]?.payload as { acute: number; chronic: number; ratio: number };
                return (
                  <TooltipCard
                    title={mediumDate(p.label)}
                    rows={[
                      { label: "Fatigue (7d)", value: r.acute.toFixed(1), color: LOAD },
                      { label: "Fitness (42d)", value: r.chronic.toFixed(1), color: RECOVERY },
                      { label: "Ratio", value: r.ratio.toFixed(2) },
                    ]}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>

      <Legend
        items={[
          { label: "Fatigue — 7 day", color: LOAD },
          { label: "Fitness — 42 day", color: RECOVERY },
        ]}
      />
    </div>
  );
}

/** The acute:chronic ratio on its own, with the productive band drawn in. */
export function RatioChart({ data, height = 150 }: { data: LoadPoint[]; height?: number }) {
  const rows = useMemo(
    () => data.filter((p) => p.chronic > 1).map((p) => ({ date: p.date, ratio: p.ratio })),
    [data],
  );

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 22, bottom: 2, left: 0 }}>
          <Grid />
          <TimeAxis formatter={shortLabel} />
          <ValueAxis domain={[0, 2]} width={30} formatter={(v) => v.toFixed(1)} ticks={[0, 0.8, 1.3, 2]} />

          <ReferenceArea y1={0.8} y2={1.3} fill={LOAD} fillOpacity={0.09} stroke="none" />

          <Line
            dataKey="ratio"
            stroke={ENERGY}
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
          />

          <Tooltip
            cursor={{ stroke: "#2c3846", strokeWidth: 1 }}
            content={(p: RechartsTooltipProps) => {
              if (!p.active || !p.payload?.length || typeof p.label !== "string") return null;
              const r = p.payload[0]?.payload as { ratio: number };
              return (
                <TooltipCard
                  title={mediumDate(p.label)}
                  rows={[{ label: "Acute : chronic", value: r.ratio.toFixed(2), color: ENERGY }]}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/* ── weekly volume ──────────────────────────────────────────────────────── */

export function WeeklyVolumeChart({
  weeks,
  units,
  height = 220,
}: {
  weeks: WeekSummary[];
  units: UnitSystem;
  height?: number;
}) {
  const rows = useMemo(
    () =>
      weeks.map((w) => ({
        label: w.label,
        hours: Math.round((w.durationMin / 60) * 10) / 10,
        distance: Math.round(w.distanceKm * 10) / 10,
        sessions: w.sessions,
      })),
    [weeks],
  );

  const avg = rows.length ? rows.reduce((a, r) => a + r.hours, 0) / rows.length : 0;

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 22, bottom: 2, left: 0 }}>
          <Grid />
          <XAxis dataKey="label" {...axisCommon} minTickGap={20} dy={6} />
          <ValueAxis width={34} domain={[0, "auto"]} formatter={hourTick} />

          <Bar dataKey="hours" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {rows.map((r, i) => (
              // Weeks above the period average read as the built weeks.
              <Cell key={i} fill={r.hours >= avg ? LOAD : "#2c3846"} />
            ))}
          </Bar>

          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={(p: RechartsTooltipProps) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0]?.payload as { label: string; hours: number; distance: number; sessions: number };
              return (
                <TooltipCard
                  title={`Week of ${r.label}`}
                  rows={[
                    { label: "Training time", value: `${r.hours.toFixed(1)} h`, color: LOAD },
                    { label: "Distance", value: `${km(r.distance, units, 1)} ${units === "imperial" ? "mi" : "km"}` },
                    { label: "Sessions", value: String(r.sessions) },
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/* ── heart-rate zones ───────────────────────────────────────────────────── */

const ZONE_COLORS = ["#45d6f5", "#7ee0c0", LOAD, ENERGY, CARDIAC];

/**
 * Horizontal because zone names are words, not numbers — a vertical bar chart
 * would force them to rotate, and rotated axis labels are unreadable.
 */
export function ZoneChart({ minutes, height = 190 }: { minutes: number[]; height?: number }) {
  const total = minutes.reduce((a, b) => a + b, 0);
  const rows = minutes.map((m, i) => ({
    zone: ZONE_NAMES[i],
    description: ZONE_DESCRIPTIONS[i],
    minutes: Math.round(m),
    pct: total > 0 ? (m / total) * 100 : 0,
  }));

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="zone"
            {...axisCommon}
            width={30}
            tick={{ fill: "#9dacbf", fontSize: 10, fontFamily: "JetBrains Mono Variable, monospace" }}
          />
          <Bar dataKey="minutes" radius={[0, 3, 3, 0]} isAnimationActive={false} barSize={16}>
            {rows.map((_, i) => (
              <Cell key={i} fill={ZONE_COLORS[i]} fillOpacity={0.85} />
            ))}
          </Bar>
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={(p: RechartsTooltipProps) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0]?.payload as {
                zone: string;
                description: string;
                minutes: number;
                pct: number;
              };
              return (
                <TooltipCard
                  title={r.description}
                  rows={[
                    { label: "Time", value: hoursMinutes(r.minutes) },
                    { label: "Share", value: `${r.pct.toFixed(0)}%` },
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/* ── sleep architecture ─────────────────────────────────────────────────── */

export function SleepStagesChart({
  sleep,
  height = 220,
}: {
  sleep: SleepRecord[];
  height?: number;
}) {
  const rows = useMemo(
    () =>
      sleep.map((s) => ({
        date: s.date,
        deep: (s.deepMinutes ?? 0) / 60,
        rem: (s.remMinutes ?? 0) / 60,
        light: (s.lightMinutes ?? 0) / 60,
        awake: (s.awakeMinutes ?? 0) / 60,
        total: s.totalMinutes,
      })),
    [sleep],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <ChartBox height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 22, bottom: 2, left: 0 }} stackOffset="none">
            <Grid />
            <TimeAxis formatter={shortLabel} />
            <ValueAxis width={30} formatter={(v) => v.toFixed(0)} />

            {/* Stacked deep → REM → light: restorative stages sit at the base
                so their thickness is read against a flat baseline. */}
            <Area dataKey="deep" stackId="s" stroke="none" fill="#2f7fd4" fillOpacity={0.9} isAnimationActive={false} />
            <Area dataKey="rem" stackId="s" stroke="none" fill={RECOVERY} fillOpacity={0.75} isAnimationActive={false} />
            <Area dataKey="light" stackId="s" stroke="none" fill="#7ee0c0" fillOpacity={0.3} isAnimationActive={false} />
            <Area dataKey="awake" stackId="s" stroke="none" fill={CARDIAC} fillOpacity={0.4} isAnimationActive={false} />

            <Tooltip
              cursor={{ stroke: "#2c3846", strokeWidth: 1 }}
              content={(p: RechartsTooltipProps) => {
                if (!p.active || !p.payload?.length || typeof p.label !== "string") return null;
                const r = p.payload[0]?.payload as {
                  deep: number; rem: number; light: number; awake: number; total: number;
                };
                return (
                  <TooltipCard
                    title={mediumDate(p.label)}
                    rows={[
                      { label: "Total", value: hoursMinutes(r.total) },
                      { label: "Deep", value: hoursMinutes(r.deep * 60), color: "#2f7fd4" },
                      { label: "REM", value: hoursMinutes(r.rem * 60), color: RECOVERY },
                      { label: "Light", value: hoursMinutes(r.light * 60), color: "#7ee0c0" },
                      { label: "Awake", value: hoursMinutes(r.awake * 60), color: CARDIAC },
                    ]}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartBox>

      <Legend
        items={[
          { label: "Deep", color: "#2f7fd4" },
          { label: "REM", color: RECOVERY },
          { label: "Light", color: "#7ee0c0" },
          { label: "Awake", color: CARDIAC },
        ]}
      />
    </div>
  );
}

/* ── energy split ───────────────────────────────────────────────────────── */

/**
 * Where the day's burn goes. A single stacked bar rather than a donut: the
 * quantity people compare is "how big is this slice against my intake", which
 * is a length comparison, and lengths beat angles for that.
 */
export function TdeeSplitChart({
  breakdown,
  intake,
}: {
  breakdown: TdeeBreakdown;
  intake: number;
}) {
  const parts = [
    { key: "Resting", value: breakdown.bmr, color: MASS },
    { key: "Daily living", value: breakdown.baselineNeat, color: "#7ee0c0" },
    { key: "Steps", value: breakdown.stepNeat, color: RECOVERY },
    { key: "Training", value: breakdown.exercise, color: LOAD },
    { key: "Digestion", value: breakdown.tef, color: ENERGY },
  ];
  const total = breakdown.total;
  const scale = Math.max(total, intake);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow">Burned</span>
          <span className="font-mono text-[15px] text-ink">{Math.round(total).toLocaleString()} kcal</span>
        </div>
        <div className="flex h-7 w-full overflow-hidden rounded-md border border-line">
          {parts.map((p) => (
            <div
              key={p.key}
              className="h-full transition-[width] duration-500 ease-out"
              style={{
                width: `${(p.value / scale) * 100}%`,
                backgroundColor: p.color,
                opacity: 0.85,
              }}
              title={`${p.key}: ${Math.round(p.value)} kcal`}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow">Eaten</span>
          <span className="font-mono text-[15px] text-ink">{Math.round(intake).toLocaleString()} kcal</span>
        </div>
        <div className="flex h-7 w-full overflow-hidden rounded-md border border-line bg-surface">
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{ width: `${(intake / scale) * 100}%`, backgroundColor: ENERGY, opacity: 0.85 }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-[13px] text-ink-muted">{p.key}</span>
            </span>
            <span className="font-mono text-[13px] text-ink-muted">
              {Math.round(p.value).toLocaleString()}
              <span className="ml-1 text-ink-faint">
                {((p.value / total) * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── steps ──────────────────────────────────────────────────────────────── */

export function StepsChart({
  data,
  goal = 8000,
  height = 200,
}: {
  data: { date: string; steps: number }[];
  goal?: number;
  height?: number;
}) {
  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 22, bottom: 2, left: 0 }}>
          <Grid />
          <TimeAxis formatter={shortLabel} />
          <ValueAxis width={34} domain={[0, "auto"]} formatter={(v) => compactNumber(v)} />
          <Bar dataKey="steps" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.steps >= goal ? RECOVERY : "#2c3846"} />
            ))}
          </Bar>
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={(p: RechartsTooltipProps) => {
              if (!p.active || !p.payload?.length || typeof p.label !== "string") return null;
              const r = p.payload[0]?.payload as { steps: number };
              return (
                <TooltipCard
                  title={mediumDate(p.label)}
                  rows={[
                    { label: "Steps", value: r.steps.toLocaleString(), color: RECOVERY },
                    { label: "vs goal", value: `${r.steps >= goal ? "+" : ""}${(r.steps - goal).toLocaleString()}` },
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/* ── sleep duration ─────────────────────────────────────────────────────── */

export function SleepDurationChart({
  sleep,
  height = 200,
}: {
  sleep: SleepRecord[];
  height?: number;
}) {
  const rows = sleep.map((s) => ({ date: s.date, hours: s.totalMinutes / 60, score: s.score ?? 0 }));

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 22, bottom: 2, left: 0 }}>
          <Grid />
          <TimeAxis formatter={shortLabel} />
          <ValueAxis width={30} domain={[0, "auto"]} formatter={(v) => v.toFixed(0)} />
          <ReferenceArea y1={7} y2={9} fill={RECOVERY} fillOpacity={0.07} stroke="none" />
          <Bar dataKey="hours" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.hours >= 7 ? RECOVERY : r.hours >= 6 ? "#3c7d92" : "#2c3846"} />
            ))}
          </Bar>
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={(p: RechartsTooltipProps) => {
              if (!p.active || !p.payload?.length || typeof p.label !== "string") return null;
              const r = p.payload[0]?.payload as { hours: number; score: number };
              return (
                <TooltipCard
                  title={mediumDate(p.label)}
                  rows={[
                    { label: "Slept", value: `${decimalHours(r.hours * 60)} h`, color: RECOVERY },
                    ...(r.score ? [{ label: "Sleep score", value: String(r.score) }] : []),
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/**
 * Hours axis. A short export can span a range of tenths, where `toFixed(0)`
 * collapses every tick to the same integer and the axis reads "2 2 2 2 2".
 */
function hourTick(v: number): string {
  return v >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
}

function shortLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
