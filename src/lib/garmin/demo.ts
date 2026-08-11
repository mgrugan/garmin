/**
 * Built-in sample dataset.
 *
 * This exists so the dashboard is fully explorable before an export is
 * imported, and so every chart has a known-good shape to render against.
 *
 * It is generated, not recorded, but it is not random noise: the series are
 * correlated the way real physiology is. Resting HR falls as fitness rises,
 * HRV drops the day after a hard session, sleep shortens on weeknights, steps
 * spike on long-run days, and weight follows a slow trend with the water-weight
 * jitter that makes real scale data so hard to read. Anything the dashboard
 * claims to detect should be detectable here.
 *
 * The PRNG is seeded, so the sample is identical on every load — a demo that
 * reshuffles on refresh makes the app impossible to reason about.
 */

import { finalise } from "./parse";
import type {
  ActivityRecord,
  ActivityType,
  DayRecord,
  GarminDataset,
  HrvRecord,
  SleepRecord,
  Vo2MaxRecord,
  WeightRecord,
} from "./types";

/** mulberry32 — small, fast, and good enough for plausible-looking noise. */
function mulberry32(seed: number) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 540; // 18 months

export function buildDemoDataset(): GarminDataset {
  const rand = mulberry32(20260811);
  /** Box-Muller, so noise is normal rather than uniform. */
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const days: DayRecord[] = [];
  const sleep: SleepRecord[] = [];
  const weight: WeightRecord[] = [];
  const activities: ActivityRecord[] = [];
  const vo2max: Vo2MaxRecord[] = [];
  const hrv: HrvRecord[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Slow-moving state that carries between days.
  let weightKg = 88.4;
  let bodyFat = 24.8;
  let fitness = 0; // 0 → 1 over the sample, drives VO2max and resting HR
  let yesterdayLoad = 0;

  for (let i = DAYS; i >= 0; i--) {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - i);
    const date = iso(d);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const t = (DAYS - i) / DAYS; // 0 → 1 across the sample

    // Training got more consistent over the period, with a dip around the
    // four-month mark so there is a real plateau to find.
    const slump = Math.exp(-(((t - 0.42) / 0.07) ** 2)) * 0.75;
    const consistency = Math.min(1, 0.45 + t * 0.65) * (1 - slump);
    fitness = Math.min(1, fitness + consistency * 0.0022);

    /* ── activities ──────────────────────────────────────────────────── */
    let dayLoad = 0;
    const sessionRoll = rand();
    const trains = sessionRoll < 0.34 + consistency * 0.33;

    if (trains) {
      const kind = pickType(rand(), dow);
      const act = makeActivity(kind, date, isWeekend, fitness, rand, gauss);
      activities.push(act);
      dayLoad += act.durationMin * (kind === "yoga" ? 0.4 : 1);

      // Brick days: a second, shorter session.
      if (rand() < 0.12) {
        const second = makeActivity(rand() < 0.6 ? "strength" : "walk", date, isWeekend, fitness, rand, gauss);
        activities.push(second);
        dayLoad += second.durationMin * 0.6;
      }
    }

    /* ── steps ───────────────────────────────────────────────────────── */
    const baseSteps = isWeekend ? 7600 : 9200;
    const steps = Math.max(
      1200,
      Math.round(baseSteps + dayLoad * 42 + gauss() * 2100 + t * 900),
    );

    /* ── resting HR: falls with fitness, rises the day after hard work ── */
    const restingHeartRate = Math.round(
      58 - fitness * 7 + yesterdayLoad * 0.018 + gauss() * 1.8,
    );

    /* ── sleep ───────────────────────────────────────────────────────── */
    // Weeknights are shorter and more variable; Friday/Saturday recover.
    const sleepBase = isWeekend ? 452 : 398;
    const totalMinutes = Math.max(
      240,
      Math.round(sleepBase + t * 22 - yesterdayLoad * 0.05 + gauss() * 38),
    );
    const deepMinutes = Math.round(totalMinutes * (0.15 + fitness * 0.025 + gauss() * 0.014));
    const remMinutes = Math.round(totalMinutes * (0.21 + gauss() * 0.02));
    const awakeMinutes = Math.round(Math.max(4, 26 - fitness * 6 + gauss() * 9));
    const lightMinutes = Math.max(60, totalMinutes - deepMinutes - remMinutes - awakeMinutes);

    const score = Math.round(
      clamp(
        52 +
          (totalMinutes - 400) * 0.055 +
          (deepMinutes - 60) * 0.22 +
          fitness * 9 -
          awakeMinutes * 0.28 +
          gauss() * 4,
        20,
        98,
      ),
    );

    sleep.push({
      date,
      totalMinutes,
      deepMinutes,
      lightMinutes,
      remMinutes,
      awakeMinutes,
      score,
      restingHeartRate,
    });

    /* ── HRV: suppressed by yesterday's load, lifted by fitness ─────── */
    hrv.push({
      date,
      avgMs: Math.round(
        clamp(38 + fitness * 13 - yesterdayLoad * 0.035 + gauss() * 4.5, 18, 96),
      ),
      status: "balanced",
    });

    /* ── daily wellness ──────────────────────────────────────────────── */
    const caloriesActive = Math.round(steps * 0.042 + dayLoad * 7.4 + gauss() * 60);
    days.push({
      date,
      steps,
      caloriesActive,
      caloriesTotal: Math.round(1810 + caloriesActive * 0.94 + gauss() * 55),
      restingHeartRate,
      intensityMinutesModerate: Math.round(Math.max(0, dayLoad * 0.55 + gauss() * 7)),
      intensityMinutesVigorous: Math.round(Math.max(0, dayLoad * 0.3 + gauss() * 5)),
      floorsClimbed: Math.round(Math.max(0, 9 + gauss() * 5)),
      stressAvg: Math.round(clamp(34 - fitness * 6 + yesterdayLoad * 0.02 + gauss() * 7, 12, 78)),
      bodyBatteryHigh: Math.round(clamp(68 + fitness * 14 + gauss() * 8, 40, 100)),
      bodyBatteryLow: Math.round(clamp(22 + fitness * 8 - yesterdayLoad * 0.02 + gauss() * 7, 5, 60)),
    });

    /* ── weight: slow trend, weekly rhythm, water-weight jitter ─────── */
    // Loss stalls during the slump, which is the pattern most people actually see.
    const trendPerDay = -0.0165 * (1 - slump * 0.9);
    weightKg += trendPerDay + gauss() * 0.09 + (isWeekend ? 0.055 : -0.02);
    bodyFat = clamp(bodyFat - 0.0135 * (1 - slump * 0.9) + gauss() * 0.03, 12, 30);

    // Not every day has a weigh-in — roughly 5 a week, as with a real scale.
    if (rand() < 0.72) {
      weight.push({
        date,
        weightKg: round(weightKg, 2),
        bodyFatPct: round(bodyFat, 1),
        muscleMassKg: round(weightKg * (1 - bodyFat / 100) * 0.52, 2),
        bodyWaterPct: round(clamp(55 + gauss() * 1.1, 45, 65), 1),
        boneMassKg: round(3.3 + gauss() * 0.05, 2),
      });
    }

    /* ── VO2max: Garmin only updates it after qualifying runs ───────── */
    if (i % 9 === 0) {
      vo2max.push({
        date,
        value: round(clamp(41.5 + fitness * 8.2 + gauss() * 0.5, 30, 62), 1),
        sport: "running",
      });
    }

    yesterdayLoad = dayLoad;
  }

  return finalise(
    { days, sleep, weight, activities, vo2max, hrv },
    ["Sample dataset"],
    [],
    {
      heightCm: 180,
      age: 34,
      sex: "male",
      startWeightKg: weight.at(-1)?.weightKg ?? 79,
      bodyFatPct: weight.at(-1)?.bodyFatPct,
    },
    true,
  );
}

/* ── activity synthesis ─────────────────────────────────────────────────── */

function pickType(r: number, dow: number): ActivityType {
  // Long ride on Saturday, long run on Sunday — a typical amateur week.
  if (dow === 6 && r < 0.42) return "ride";
  if (dow === 0 && r < 0.5) return "run";
  if (r < 0.38) return "run";
  if (r < 0.58) return "strength";
  if (r < 0.72) return "ride";
  if (r < 0.82) return "walk";
  if (r < 0.9) return "cardio";
  if (r < 0.96) return "yoga";
  return "swim";
}

function makeActivity(
  type: ActivityType,
  date: string,
  isWeekend: boolean,
  fitness: number,
  rand: () => number,
  gauss: () => number,
): ActivityRecord {
  const long = isWeekend && rand() < 0.55;

  const spec = {
    run: { min: long ? 78 : 41, speedKmh: 10.2 + fitness * 1.9, hr: 152 },
    ride: { min: long ? 112 : 55, speedKmh: 26 + fitness * 3.4, hr: 138 },
    swim: { min: 38, speedKmh: 3.1, hr: 132 },
    walk: { min: 44, speedKmh: 5.1, hr: 104 },
    hike: { min: 96, speedKmh: 4.3, hr: 118 },
    strength: { min: 47, speedKmh: 0, hr: 118 },
    cardio: { min: 36, speedKmh: 0, hr: 143 },
    martial: { min: 62, speedKmh: 0, hr: 152 },
    yoga: { min: 42, speedKmh: 0, hr: 92 },
    other: { min: 40, speedKmh: 0, hr: 120 },
  }[type];

  const durationMin = Math.max(12, Math.round(spec.min + gauss() * spec.min * 0.16));
  const distanceKm =
    spec.speedKmh > 0
      ? round((durationMin / 60) * (spec.speedKmh + gauss() * 0.8), 2)
      : undefined;

  const avgHr = Math.round(clamp(spec.hr + gauss() * 7 - fitness * 3, 78, 186));
  const maxHr = Math.round(clamp(avgHr + 14 + rand() * 16, avgHr + 5, 198));

  // MET-based, matching the fallback in the energy model.
  const met = { run: 9.8, ride: 7.5, swim: 8.3, walk: 3.5, hike: 6, strength: 5, cardio: 7, martial: 9.5, yoga: 3, other: 5 }[type];
  const calories = Math.round((met * 3.5 * 84 * durationMin) / 200 + gauss() * 25);

  return {
    date,
    type,
    rawType: type,
    title: `${TITLE[type]}${long ? " — long" : ""}`,
    durationMin,
    distanceKm,
    calories,
    avgHr,
    maxHr,
    elevationGainM:
      distanceKm && (type === "run" || type === "ride" || type === "hike")
        ? Math.round(distanceKm * (8 + rand() * 14))
        : undefined,
    aerobicTE: round(clamp(1.4 + (avgHr - 100) / 34 + gauss() * 0.3, 0.4, 5), 1),
    paceMinPerKm: distanceKm && distanceKm > 0.3 ? round(durationMin / distanceKm, 2) : undefined,
    avgCadence: type === "run" ? Math.round(168 + gauss() * 5) : undefined,
  };
}

const TITLE: Record<ActivityType, string> = {
  martial: "Muay thai",
  run: "Run",
  ride: "Ride",
  swim: "Pool swim",
  walk: "Walk",
  hike: "Hike",
  strength: "Strength",
  cardio: "Cardio",
  yoga: "Mobility",
  other: "Session",
};

/* ── helpers ────────────────────────────────────────────────────────────── */

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
