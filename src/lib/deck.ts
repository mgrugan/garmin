/**
 * One derivation pass, shared by every view.
 *
 * The views used to each slice and roll up the dataset themselves, which meant
 * the same 18 months of data was walked five times per range change and two
 * panels could disagree about what "last 30 days" meant. Everything derived
 * lives here now, memoised on `[dataset, range]`.
 */

import { useMemo } from "react";
import {
  completeDays,
  cutoffFor,
  datasetSpanDays,
  estimateMaxHr,
  mean,
  median,
  periodDelta,
  seriesFrom,
  sleepBreakdown,
  trainingLoad,
  weeklySummaries,
  withinRange,
  zoneMinutes,
  type RangeKey,
  type SleepBreakdown,
  type LoadPoint,
  type WeekSummary,
} from "./garmin/derive";
import type {
  ActivityRecord,
  ActivityType,
  DayRecord,
  GarminDataset,
  SleepRecord,
  WeightRecord,
} from "./garmin/types";
import { fitTrend, type Series, type TrendFit } from "./model/forecast";
import type { UnitSystem } from "./format";
import { buildInsights, type Insight } from "./model/insights";
import {
  bodyFromWeight,
  dailyExerciseEnergy,
  estimateBodyFatPct,
  restingMetabolicRate,
} from "./model/energy";

export interface Deck {
  /** Range-filtered slices. */
  days: DayRecord[];
  sleep: SleepRecord[];
  weight: WeightRecord[];
  activities: ActivityRecord[];

  load: LoadPoint[];
  weeks: WeekSummary[];
  zones: number[];
  sleepStats: SleepBreakdown;
  insights: Insight[];

  /** Full-history series, for trend fits that need more than the visible range. */
  series: {
    weight: Series[];
    restingHr: Series[];
    vo2max: Series[];
    hrv: Series[];
    sleepHours: Series[];
    sleepScore: Series[];
    steps: Series[];
  };

  fits: {
    weight: TrendFit | null;
    restingHr: TrendFit | null;
    vo2max: TrendFit | null;
    hrv: TrendFit | null;
  };

  /** Headline numbers for the top strip. */
  current: {
    weightKg?: number;
    bodyFatPct?: number;
    restingHr?: number;
    vo2max?: number;
    hrv?: number;
    sleepHours?: number;
    steps?: number;
    loadRatio: number;
    maxHr: number;
  };

  /** 30-day-vs-prior-30-day comparisons for the stat tiles. */
  deltas: {
    weight: ReturnType<typeof periodDelta>;
    restingHr: ReturnType<typeof periodDelta>;
    sleepHours: ReturnType<typeof periodDelta>;
    steps: ReturnType<typeof periodDelta>;
    hrv: ReturnType<typeof periodDelta>;
  };

  /** Everything the simulator needs as its starting condition. */
  baseline: {
    weightKg: number;
    bodyFatPct: number;
    hasBodyComp: boolean;
    avgSteps: number;
    exerciseKcalPerDay: number;
    maintenanceKcal: number;
    strengthSessionsPerWeek: number;
    /** What this app's equations produce for resting rate. */
    bmrKcal: number;
    /** What Garmin's own device reported, when the export includes it. */
    garminBmrKcal?: number;
  };

  totals: {
    sessions: number;
    hours: number;
    distanceKm: number;
    calories: number;
    byType: { type: ActivityType; minutes: number; sessions: number; distanceKm: number }[];
  };

  /** Days between the first and last record, across the whole dataset. */
  spanDays: number;

  /**
   * Range-filtered days with partial edge days removed. Use this for any
   * average; use `days` for charts, which should show what was recorded.
   */
  fullDays: DayRecord[];
}

export function useDeck(dataset: GarminDataset, range: RangeKey, units: UnitSystem): Deck {
  return useMemo(() => buildDeck(dataset, range, units), [dataset, range, units]);
}

export function buildDeck(
  dataset: GarminDataset,
  range: RangeKey,
  units: UnitSystem = "metric",
): Deck {
  const cutoff = cutoffFor(dataset, range);

  const days = withinRange(dataset.days, cutoff);
  const sleep = withinRange(dataset.sleep, cutoff);
  const weight = withinRange(dataset.weight, cutoff);
  const activities = withinRange(dataset.activities, cutoff);

  const maxHr = estimateMaxHr(
    dataset.profile.age,
    dataset.profile.maxHr ?? (Math.max(0, ...dataset.activities.map((a) => a.maxHr ?? 0)) || undefined),
  );

  const restingHrAll = seriesFrom(dataset.days, (d) => d.restingHeartRate);
  const restingHrBaseline = restingHrAll.length
    ? mean(restingHrAll.slice(-60).map((p) => p.value))
    : 55;

  const fullDays = completeDays(days);
  const load = trainingLoad(activities, days, maxHr, restingHrBaseline);
  const weeks = weeklySummaries(activities);
  const zones = zoneMinutes(activities, maxHr, dataset.profile.zoneFloors);
  const sleepStats = sleepBreakdown(sleep);

  // Full-history series — trend fits need depth the visible range may not have.
  const series = {
    weight: seriesFrom(dataset.weight, (w) => w.weightKg),
    restingHr: restingHrAll,
    vo2max: seriesFrom(dataset.vo2max, (v) => v.value),
    hrv: seriesFrom(dataset.hrv, (h) => h.avgMs),
    sleepHours: seriesFrom(dataset.sleep, (s) => s.totalMinutes / 60),
    sleepScore: seriesFrom(dataset.sleep, (s) => s.score),
    steps: seriesFrom(dataset.days, (d) => d.steps),
  };

  // Fits use a trailing window rather than all history: a two-year-old slope is
  // not a forecast of next month.
  const fits = {
    weight: fitTrend(series.weight.slice(-90)),
    restingHr: fitTrend(series.restingHr.slice(-90)),
    vo2max: fitTrend(series.vo2max.slice(-20)),
    hrv: fitTrend(series.hrv.slice(-90)),
  };

  const latestWeight = dataset.weight.at(-1);
  const current = {
    weightKg: latestWeight?.weightKg,
    bodyFatPct: latestWeight?.bodyFatPct,
    restingHr: series.restingHr.at(-1)?.value,
    vo2max: series.vo2max.at(-1)?.value,
    hrv: series.hrv.at(-1)?.value,
    sleepHours: series.sleepHours.at(-1)?.value,
    steps: series.steps.at(-1)?.value,
    loadRatio: load.at(-1)?.ratio ?? 0,
    maxHr,
  };

  const deltas = {
    weight: periodDelta(series.weight, 30),
    restingHr: periodDelta(series.restingHr, 30),
    sleepHours: periodDelta(series.sleepHours, 30),
    steps: periodDelta(series.steps, 30),
    hrv: periodDelta(series.hrv, 30),
  };

  /* ── simulator baseline ─────────────────────────────────────────────── */

  // Anchor on the last 8 weeks — recent enough to describe current habits,
  // long enough that one big week doesn't distort maintenance.
  const recentDays = completeDays(dataset.days).slice(-56);
  const recentActivities = dataset.activities.filter(
    (a) => recentDays.length > 0 && a.date >= recentDays[0].date,
  );

  const startWeightKg = latestWeight?.weightKg ?? dataset.profile.startWeightKg;
  const hasBodyComp = latestWeight?.bodyFatPct !== undefined;
  const bodyFatPct =
    latestWeight?.bodyFatPct ??
    dataset.profile.bodyFatPct ??
    estimateBodyFatPct(
      startWeightKg,
      dataset.profile.heightCm,
      dataset.profile.age,
      dataset.profile.sex,
    );

  const avgSteps = Math.round(
    mean(recentDays.map((d) => d.steps ?? 0).filter((s) => s > 0)) || 7000,
  );

  const body = bodyFromWeight(startWeightKg, bodyFatPct);
  const bmr = restingMetabolicRate(body, dataset.profile, hasBodyComp);
  const exerciseKcalPerDay = dailyExerciseEnergy(
    recentActivities,
    Math.max(1, recentDays.length),
    bmr,
    startWeightKg,
  );

  const strengthSessionsPerWeek =
    recentDays.length > 0
      ? recentActivities.filter((a) => a.type === "strength").length / (recentDays.length / 7)
      : 0;

  // Garmin reports its own resting figure per day. It routinely runs well
  // above the predictive equations, so it is carried through and surfaced
  // rather than quietly contradicted.
  const garminBmrValues = recentDays
    .map((d) => d.caloriesBmr)
    .filter((v): v is number => v !== undefined && v > 800);
  const garminBmr = garminBmrValues.length ? median(garminBmrValues) : undefined;

  // Maintenance at current habits: everything except the thermic effect, which
  // depends on intake and so is added by the simulator itself.
  const maintenanceKcal =
    bmr + bmr * 0.1 + (avgSteps / 1389) * 0.53 * startWeightKg + exerciseKcalPerDay;

  /* ── totals ─────────────────────────────────────────────────────────── */

  const byTypeMap = new Map<ActivityType, { minutes: number; sessions: number; distanceKm: number }>();
  for (const a of activities) {
    const e = byTypeMap.get(a.type) ?? { minutes: 0, sessions: 0, distanceKm: 0 };
    e.minutes += a.durationMin;
    e.sessions += 1;
    e.distanceKm += a.distanceKm ?? 0;
    byTypeMap.set(a.type, e);
  }

  const totals = {
    sessions: activities.length,
    hours: activities.reduce((a, b) => a + b.durationMin, 0) / 60,
    distanceKm: activities.reduce((a, b) => a + (b.distanceKm ?? 0), 0),
    calories: activities.reduce((a, b) => a + (b.calories ?? 0), 0),
    byType: [...byTypeMap.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.minutes - a.minutes),
  };

  const insights = buildInsights({
    dataset,
    days,
    sleep,
    activities,
    load,
    maxHr,
    units,
    weightKg: startWeightKg,
  });
  const spanDays = datasetSpanDays(dataset);

  return {
    days,
    sleep,
    weight,
    activities,
    load,
    weeks,
    zones,
    sleepStats,
    insights,
    series,
    fits,
    current,
    deltas,
    baseline: {
      weightKg: startWeightKg,
      bodyFatPct,
      hasBodyComp,
      avgSteps,
      exerciseKcalPerDay,
      maintenanceKcal,
      strengthSessionsPerWeek,
      bmrKcal: bmr,
      garminBmrKcal: garminBmr,
    },
    totals,
    spanDays,
    fullDays,
  };
}
