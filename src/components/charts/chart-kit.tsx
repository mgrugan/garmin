/**
 * Shared chart conventions.
 *
 * Every chart in the deck goes through these so the whole app reads as one
 * instrument: identical tick treatment, identical grid weight, identical
 * tooltip, and one rule that matters more than the rest — measured data is a
 * solid stroke, modelled data is dashed over a filled uncertainty band. A user
 * should never have to check a legend to know whether they are looking at a
 * recording or a guess.
 */

import type { ReactNode } from "react";
import { CartesianGrid, XAxis, YAxis } from "recharts";

export const GRID = "#1e2733";
export const TICK = "#77859a";

/** Axis props applied to every chart. Exported as objects so charts spread them. */
export const axisCommon = {
  stroke: GRID,
  tick: { fill: TICK, fontSize: 10, fontFamily: "JetBrains Mono Variable, monospace" },
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Category-scaled date axis. Correct only for daily-dense series, where every
 * row is one day and equal spacing is the truth — daily bars, load, steps.
 * For anything sparse or mixed-cadence use `TimeScaleAxis`.
 */
export function TimeAxis({
  dataKey = "date",
  formatter,
  minTickGap = 44,
}: {
  dataKey?: string;
  formatter: (v: string) => string;
  minTickGap?: number;
}) {
  return (
    <XAxis
      dataKey={dataKey}
      {...axisCommon}
      tickFormatter={formatter}
      minTickGap={minTickGap}
      dy={6}
    />
  );
}

/**
 * True time-scaled axis, positioned by timestamp rather than by row index.
 *
 * This matters wherever a series mixes cadences. VO₂max updates roughly every
 * nine days while its projection is daily, so on a category axis 40 readings
 * covering a year would occupy less width than 90 days of forecast — the past
 * gets visually compressed by a factor of four and the trend looks steeper than
 * it is. Same hazard on the weight chart, where scale readings are ~5 a week
 * against a daily simulation.
 */
export function TimeScaleAxis({
  formatter,
  minTickGap = 44,
}: {
  formatter: (ms: number) => string;
  minTickGap?: number;
}) {
  return (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={["dataMin", "dataMax"]}
      {...axisCommon}
      tickFormatter={formatter}
      minTickGap={minTickGap}
      dy={6}
    />
  );
}

/** ms → "Mar 14". Shared so every axis and tooltip agrees on date wording. */
export function tickDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ValueAxis({
  domain,
  formatter,
  width = 40,
  orientation = "left",
  ticks,
}: {
  domain?: [number | string, number | string];
  formatter?: (v: number) => string;
  width?: number;
  orientation?: "left" | "right";
  ticks?: number[];
}) {
  return (
    <YAxis
      {...axisCommon}
      domain={domain ?? ["auto", "auto"]}
      tickFormatter={formatter}
      width={width}
      orientation={orientation}
      ticks={ticks}
    />
  );
}

export function Grid({ vertical = false }: { vertical?: boolean }) {
  return <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={vertical} opacity={0.55} />;
}

/* ── tooltip ────────────────────────────────────────────────────────────── */

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  /** Marks a value as modelled rather than measured. */
  projected?: boolean;
}

/**
 * Fixed row order and tabular numerals, so values hold their position as the
 * pointer moves. A tooltip whose rows reflow between frames is unreadable at
 * speed, which is exactly when people scrub a chart.
 */
export function TooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="pointer-events-none min-w-[168px] rounded-md border border-line-strong bg-overlay/95 px-3 py-2.5 shadow-xl backdrop-blur-sm">
      <p className="eyebrow mb-2 text-ink-muted">{title}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5">
              {r.color && (
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
              )}
              <span className="truncate text-[12px] text-ink-muted">{r.label}</span>
            </span>
            <span className="shrink-0 font-mono text-[12px] text-ink">
              {r.value}
              {r.projected && <span className="ml-1 text-ink-faint">est</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Recharts hands tooltips a loosely typed payload; this narrows it once, here,
 * so no chart has to cast. `payload` is readonly to match Recharts 3, which
 * hands out a frozen array.
 */
export interface RechartsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly {
    dataKey?: string | number | ((obj: never) => unknown);
    name?: string | number;
    value?: unknown;
    color?: string;
    payload?: Record<string, unknown>;
  }[];
}

/* ── legend ─────────────────────────────────────────────────────────────── */

export function Legend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="h-0.5 w-4 shrink-0 rounded-full"
            style={{
              backgroundColor: i.dashed ? "transparent" : i.color,
              backgroundImage: i.dashed
                ? `repeating-linear-gradient(to right, ${i.color} 0 4px, transparent 4px 8px)`
                : undefined,
            }}
          />
          <span className="eyebrow">{i.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Wraps a chart with its own height so panels don't fight over layout. */
export function ChartBox({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="w-full" style={{ height }}>
      {children}
    </div>
  );
}
