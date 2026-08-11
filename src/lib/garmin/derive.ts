/**
 * Derived views over the raw dataset.
 *
 * Everything here is pure and memo-friendly: the dashboard recomputes these on
 * every range change, so they take the already-filtered arrays and never reach
 * back for the full dataset.
 */

import type {
  ActivityRecord,
  ActivityType,
  DayRecord,
  GarminDataset,
  ISODate,
  SleepRecord,
} from "./types";
import type { Series } from "../model/forecast";

export type RangeKey = "30d" | "90d" | "6m" | "1y" | "all";

export const RANGE_DAYS: Record<RangeKey, number> = {
  "30d": 30,
  "90d": 90,
  "6m": 182,
  "1y": 365,
  all: Number.MAX_SAFE_INTEGER,
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "6m": "6 months",
  "1y": "1 year",
  all: "All time",
};

export function cutoffFor(dataset: GarminDataset, range: RangeKey): ISODate {
  const last = dataset.meta.lastDate;
  if (!last || range === "all") return "0000-01-01";
  const d = new Date(`${last}T00:00:00`);
  d.setDate(d.getDate() - RANGE_DAYS[range]);
  return d.toISOString().slice(0, 10);
}

export function withinRange<T extends { date: ISODate }>(rows: T[], cutoff: ISODate): T[] {
  return rows.filter((r) => r.date >= cutoff);
}

/* ── rolling statistics ─────────────────────────────────────────────────── */

/**
 * Centred-trailing rolling mean. Trailing rather than centred so the last
 * point is always defined — a chart whose trend line stops 15 days short of
 * the data looks broken.
 */
export function rollingMean(series: Series[], window: number): Series[] {
  const out: Series[] = [];
  let sum = 0;
  const buf: number[] = [];

  for (const p of series) {
    buf.push(p.value);
    sum += p.value;
    if (buf.length > window) sum -= buf.shift()!;
    out.push({ date: p.date, value: sum / buf.length });
  }
  return out;
}

/** Exponentially weighted mean — used for training load, where recency matters. */
export function ewma(series: Series[], halfLifeDays: number): Series[] {
  const alpha = 1 - Math.exp(-Math.LN2 / halfLifeDays);
  let acc: number | null = null;
  return series.map((p) => {
    acc = acc === null ? p.value : acc + alpha * (p.value - acc);
    return { date: p.date, value: acc };
  });
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ── series extraction ──────────────────────────────────────────────────── */

export function seriesFrom<T extends { date: ISODate }>(
  rows: T[],
  value: (r: T) => number | undefined,
): Series[] {
  const out: Series[] = [];
  for (const r of rows) {
    const v = value(r);
    if (v !== undefined && Number.isFinite(v)) out.push({ date: r.date, value: v });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── training load ──────────────────────────────────────────────────────── */

export interface LoadPoint {
  date: ISODate;
  /** Daily training impulse. */
  load: number;
  /** 7-day EWMA — "fatigue". */
  acute: number;
  /** 42-day EWMA — "fitness". */
  chronic: number;
  /** chronic − acute. Positive means fresh. */
  balance: number;
  /** acute ÷ chronic. The injury-risk ratio. */
  ratio: number;
}

/**
 * Banister-style impulse-response load.
 *
 * Uses Garmin's aerobic training effect where it exists, because that already
 * encodes intensity properly. Where it doesn't, falls back to duration scaled
 * by heart-rate reserve — a poor man's TRIMP, but consistent.
 */
export function trainingLoad(
  activities: ActivityRecord[],
  days: DayRecord[],
  maxHr: number,
  restingHr: number,
): LoadPoint[] {
  const byDate = new Map<ISODate, number>();
  for (const d of days) byDate.set(d.date, 0);

  for (const a of activities) {
    const impulse = activityImpulse(a, maxHr, restingHr);
    byDate.set(a.date, (byDate.get(a.date) ?? 0) + impulse);
  }

  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];

  // Fill gaps so the EWMA decays across rest days instead of skipping them.
  const filled: Series[] = [];
  const cursor = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00`);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    filled.push({ date: iso, value: byDate.get(iso) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const acute = ewma(filled, 7);
  const chronic = ewma(filled, 42);

  return filled.map((p, i) => {
    const a = acute[i].value;
    const c = chronic[i].value;
    return {
      date: p.date,
      load: p.value,
      acute: a,
      chronic: c,
      balance: c - a,
      ratio: c > 1 ? a / c : 0,
    };
  });
}

export function activityImpulse(a: ActivityRecord, maxHr: number, restingHr: number): number {
  if (a.aerobicTE && a.aerobicTE > 0) {
    // TE is 0–5 and roughly logarithmic; scale to a comparable magnitude.
    return Math.pow(a.aerobicTE, 1.8) * 12;
  }
  if (a.avgHr && maxHr > restingHr) {
    const reserve = (a.avgHr - restingHr) / (maxHr - restingHr);
    // Exponential weighting so hard minutes count for much more than easy ones.
    return a.durationMin * Math.max(0.1, reserve) * Math.exp(1.9 * Math.max(0, reserve));
  }
  return a.durationMin * 1.2;
}

/** Garmin publishes 0.8–1.3 as the sweet spot for acute:chronic ratio. */
export function loadVerdict(ratio: number): { label: string; tone: "good" | "warn" | "risk" } {
  if (ratio === 0) return { label: "No load", tone: "warn" };
  if (ratio < 0.8) return { label: "Detraining", tone: "warn" };
  if (ratio <= 1.3) return { label: "Productive", tone: "good" };
  if (ratio <= 1.5) return { label: "Overreaching", tone: "warn" };
  return { label: "Injury risk", tone: "risk" };
}

/* ── heart-rate zones ───────────────────────────────────────────────────── */

export const ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
export const ZONE_NAMES = ["Z1 Warm up", "Z2 Easy", "Z3 Aerobic", "Z4 Threshold", "Z5 Maximum"];

export function zoneMinutes(activities: ActivityRecord[], maxHr: number): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const a of activities) {
    if (!a.avgHr) continue;
    const frac = a.avgHr / maxHr;
    let z = 0;
    for (let i = 1; i < ZONE_BOUNDS.length; i++) if (frac >= ZONE_BOUNDS[i]) z = i;
    buckets[Math.min(4, z)] += a.durationMin;
  }
  return buckets;
}

/** Tanaka is a better fit than 220−age across adult ages. */
export function estimateMaxHr(age: number, observedMax?: number): number {
  const tanaka = 208 - 0.7 * age;
  return observedMax && observedMax > tanaka ? observedMax : Math.round(tanaka);
}

/* ── weekly rollups ─────────────────────────────────────────────────────── */

export interface WeekSummary {
  weekStart: ISODate;
  label: string;
  durationMin: number;
  distanceKm: number;
  calories: number;
  sessions: number;
  byType: Partial<Record<ActivityType, number>>;
}

export function weeklySummaries(activities: ActivityRecord[]): WeekSummary[] {
  const weeks = new Map<ISODate, WeekSummary>();

  for (const a of activities) {
    const start = startOfWeek(a.date);
    let w = weeks.get(start);
    if (!w) {
      w = {
        weekStart: start,
        label: shortDate(start),
        durationMin: 0,
        distanceKm: 0,
        calories: 0,
        sessions: 0,
        byType: {},
      };
      weeks.set(start, w);
    }
    w.durationMin += a.durationMin;
    w.distanceKm += a.distanceKm ?? 0;
    w.calories += a.calories ?? 0;
    w.sessions += 1;
    w.byType[a.type] = (w.byType[a.type] ?? 0) + a.durationMin;
  }

  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** ISO weeks — Monday start. */
export function startOfWeek(iso: ISODate): ISODate {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shortDate(iso: ISODate): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function monthDate(iso: ISODate): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/* ── sleep ──────────────────────────────────────────────────────────────── */

export interface SleepBreakdown {
  deep: number;
  light: number;
  rem: number;
  awake: number;
  total: number;
  /** Deep + REM as a share of total — the restorative fraction. */
  restorativePct: number;
  /** Standard deviation of bedtime-to-bedtime duration, in minutes. */
  consistencyMin: number;
}

export function sleepBreakdown(sleep: SleepRecord[]): SleepBreakdown {
  const deep = mean(sleep.map((s) => s.deepMinutes ?? 0).filter((v) => v > 0));
  const light = mean(sleep.map((s) => s.lightMinutes ?? 0).filter((v) => v > 0));
  const rem = mean(sleep.map((s) => s.remMinutes ?? 0).filter((v) => v > 0));
  const awake = mean(sleep.map((s) => s.awakeMinutes ?? 0).filter((v) => v > 0));
  const total = mean(sleep.map((s) => s.totalMinutes));

  const durations = sleep.map((s) => s.totalMinutes);
  const m = mean(durations);
  const consistencyMin = Math.sqrt(mean(durations.map((d) => (d - m) ** 2)));

  return {
    deep,
    light,
    rem,
    awake,
    total,
    restorativePct: total > 0 ? ((deep + rem) / total) * 100 : 0,
    consistencyMin,
  };
}

/* ── comparison helpers ─────────────────────────────────────────────────── */

export interface Delta {
  current: number;
  previous: number;
  absolute: number;
  percent: number;
  hasPrevious: boolean;
}

/** Compares the most recent `window` days against the `window` before them. */
export function periodDelta(series: Series[], window: number): Delta {
  const recent = series.slice(-window);
  const prior = series.slice(-window * 2, -window);
  const current = mean(recent.map((p) => p.value));
  const previous = mean(prior.map((p) => p.value));
  return {
    current,
    previous,
    absolute: current - previous,
    percent: previous !== 0 ? ((current - previous) / previous) * 100 : 0,
    hasPrevious: prior.length >= Math.max(3, window / 3),
  };
}
