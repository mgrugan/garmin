/**
 * Garmin Connect export → `GarminDataset`.
 *
 * Two things make this messier than a normal CSV import, and both are handled
 * by sniffing rather than by configuration:
 *
 *  1. The JSON bundle's filenames carry account ids and date ranges
 *     (`123456_sleepData_2024-01-01.json`), so we cannot route on name alone.
 *     Instead we look at the *keys of the first record* in each array.
 *  2. Field names drift between export vintages (`totalKilocalories` vs
 *     `totalCalories`, `calendarDate` as a string vs `{date}`). Every read goes
 *     through `pick`, which tries the known aliases in order.
 *
 * Anything we cannot place is reported in `meta.skipped` rather than dropped
 * silently — a health import that quietly loses six months is worse than one
 * that fails loudly.
 */

import { unzipSync, strFromU8 } from "fflate";
import Papa from "papaparse";
import {
  type ActivityRecord,
  type DayRecord,
  type GarminDataset,
  type HrvRecord,
  type ISODate,
  type SleepRecord,
  type UserProfile,
  type Vo2MaxRecord,
  type WeightRecord,
  normaliseActivityType,
} from "./types";

const KM_PER_MILE = 1.609344;
const LB_PER_KG = 2.2046226;

export interface ParseOptions {
  /** Garmin's CSV export follows the account's display units, which the file
   *  itself never states. Callers pass what the user picked in the importer. */
  units?: "metric" | "imperial";
  profile?: Partial<UserProfile>;
}

/* ── primitives ─────────────────────────────────────────────────────────── */

function pick<T = unknown>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

/** Garmin writes "--" for absent numerics and thousands separators for large ones. */
function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim();
  if (!s || s === "--" || s === "-" || s.toLowerCase() === "null") return undefined;
  const n = Number(s.replace(/[,\s]/g, "").replace(/[^0-9.\-+eE]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** "00:28:14" | "28:14" | "1:02:33.4" → minutes. */
function durationToMinutes(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return v / 60;
  const s = String(v).trim();
  if (!s || s === "--") return undefined;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 1) return parts[0] / 60;
  return undefined;
}

/**
 * Normalises every date shape Garmin emits to a local `YYYY-MM-DD`.
 * Epoch values are disambiguated by magnitude: anything past ~1e11 is ms.
 */
function toISODate(v: unknown): ISODate | undefined {
  if (v === null || v === undefined || v === "") return undefined;

  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return toISODate(pick(o, "date", "calendarDate", "value"));
  }

  if (typeof v === "number") {
    const ms = v > 1e11 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : localISO(d);
  }

  const s = String(v).trim();
  const direct = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;

  // Numeric string that is really an epoch.
  if (/^\d{10,13}$/.test(s)) return toISODate(Number(s));

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? undefined : localISO(parsed);
}

function localISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function secondsToMinutes(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : n / 60;
}

/* ── Activities.csv ─────────────────────────────────────────────────────── */

/** Header fingerprints that identify the activity export among other CSVs. */
const ACTIVITY_CSV_MARKERS = ["activity type", "activitytype", "aktivitätstyp", "type d'activité"];

export function looksLikeActivitiesCsv(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase().trim());
  return (
    ACTIVITY_CSV_MARKERS.some((m) => lower.includes(m)) ||
    (lower.includes("date") && lower.includes("calories") && lower.includes("distance"))
  );
}

export function parseActivitiesCsv(text: string, opts: ParseOptions = {}): ActivityRecord[] {
  const imperial = opts.units === "imperial";
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const out: ActivityRecord[] = [];
  for (const row of res.data) {
    if (!row || typeof row !== "object") continue;

    // Case-insensitive lookup so locale-cased headers still resolve.
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) r[k.toLowerCase().trim()] = v;

    const date = toISODate(pick(r, "date", "start time", "datum"));
    if (!date) continue;

    const durationMin =
      durationToMinutes(pick(r, "moving time", "time", "elapsed time", "duration")) ?? 0;
    if (durationMin <= 0) continue;

    let distanceKm = num(pick(r, "distance"));
    if (distanceKm !== undefined && imperial) distanceKm *= KM_PER_MILE;

    let elevationGainM = num(pick(r, "total ascent", "elev gain", "elevation gain"));
    if (elevationGainM !== undefined && imperial) elevationGainM *= 0.3048;

    const rawType = String(pick(r, "activity type", "activitytype", "aktivitätstyp") ?? "");

    const csvTitle = (pick<string>(r, "title") ?? "").trim() || undefined;

    out.push({
      date,
      type: normaliseActivityType(rawType, csvTitle),
      rawType: rawType || undefined,
      title: csvTitle,
      durationMin,
      distanceKm: distanceKm && distanceKm > 0 ? distanceKm : undefined,
      calories: num(pick(r, "calories")),
      avgHr: num(pick(r, "avg hr", "average heart rate")),
      maxHr: num(pick(r, "max hr", "max heart rate")),
      elevationGainM,
      aerobicTE: num(pick(r, "aerobic te", "training effect")),
      anaerobicTE: num(pick(r, "anaerobic te")),
      avgCadence: num(pick(r, "avg run cadence", "avg bike cadence", "avg cadence")),
      paceMinPerKm:
        distanceKm && distanceKm > 0.05 ? clamp(durationMin / distanceKm, 1, 60) : undefined,
    });
  }
  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/* ── JSON routing ───────────────────────────────────────────────────────── */

export type Bag = {
  days: DayRecord[];
  sleep: SleepRecord[];
  weight: WeightRecord[];
  activities: ActivityRecord[];
  vo2max: Vo2MaxRecord[];
  hrv: HrvRecord[];
};

/**
 * Routes one JSON array by the key signature of its records. Returns the number
 * of records absorbed so the caller can mark a file as skipped when it is 0.
 *
 * Keys are unioned across a sample of records rather than read off the first
 * one. Real exports open and close their arrays with stub objects — the sleep
 * file's first and last entries are literally `{"retro": false}` — so keying off
 * `rows[0]` silently discarded every night of sleep in the file.
 */
function routeJsonArray(rows: Record<string, unknown>[], bag: Bag): number {
  const keys = new Set<string>();
  for (const r of rows.slice(0, 25)) {
    if (r && typeof r === "object") for (const k of Object.keys(r)) keys.add(k.toLowerCase());
  }
  if (!keys.size) return 0;
  const has = (...names: string[]) => names.some((n) => keys.has(n.toLowerCase()));

  let n = 0;

  // Activities, from the JSON bundle rather than Activities.csv. Every unit
  // here is non-obvious, so see `readSummarizedActivity`.
  if (has("activityType") && has("beginTimestamp", "startTimeLocal", "startTimeGmt")) {
    for (const r of rows) {
      const a = readSummarizedActivity(r);
      if (a) {
        bag.activities.push(a);
        n++;
      }
    }
    return n;
  }

  // Sleep: the only shape carrying per-stage second counts.
  if (has("deepSleepSeconds", "sleepTimeSeconds", "sleepStartTimestampGMT", "sleepEndTimestampGMT")) {
    for (const r of rows) {
      const date = toISODate(
        pick(r, "calendarDate", "sleepStartTimestampLocal", "sleepStartTimestampGMT", "date"),
      );
      // Newer exports drop `sleepTimeSeconds` entirely and expect the reader to
      // sum the stages.
      const total =
        secondsToMinutes(pick(r, "sleepTimeSeconds", "totalSleepSeconds")) ??
        sum([
          secondsToMinutes(pick(r, "deepSleepSeconds")),
          secondsToMinutes(pick(r, "lightSleepSeconds")),
          secondsToMinutes(pick(r, "remSleepSeconds")),
        ]);
      if (!date || !total) continue;

      // Score nesting changed shape between vintages: `sleepScores.overall.value`
      // in older files, `sleepScores.overallScore` in current ones.
      const scores = pick<Record<string, unknown>>(r, "sleepScores");
      const overall = scores ? pick<Record<string, unknown>>(scores, "overall") : undefined;

      bag.sleep.push({
        date,
        totalMinutes: total,
        deepMinutes: secondsToMinutes(pick(r, "deepSleepSeconds")),
        lightMinutes: secondsToMinutes(pick(r, "lightSleepSeconds")),
        remMinutes: secondsToMinutes(pick(r, "remSleepSeconds")),
        awakeMinutes: secondsToMinutes(pick(r, "awakeSleepSeconds", "awakeTimeSeconds")),
        score:
          num(pick(r, "sleepScore", "overallSleepScore")) ??
          (scores ? num(pick(scores, "overallScore")) : undefined) ??
          (overall ? num(pick(overall, "value")) : undefined),
        avgOvernightHrv: num(pick(r, "avgOvernightHrv", "averageHrv")),
        restingHeartRate: num(pick(r, "restingHeartRate")),
      });
      n++;
    }
    return n;
  }

  // Daily health snapshot. HRV and resting HR are buried in a `metrics` array
  // keyed by `type` rather than sitting on the record.
  if (has("metrics") && has("calendarDate")) {
    for (const r of rows) {
      const date = toISODate(pick(r, "calendarDate"));
      const metrics = pick<Record<string, unknown>[]>(r, "metrics");
      if (!date || !Array.isArray(metrics)) continue;

      const byType = (t: string) =>
        metrics.find((m) => String(pick(m, "type") ?? "").toUpperCase() === t);

      const hrv = byType("HRV");
      const value = hrv ? num(pick(hrv, "value")) : undefined;
      if (value === undefined) continue;

      bag.hrv.push({ date, avgMs: value, status: pick<string>(hrv!, "status") });
      n++;
    }
    return n;
  }

  // Weight. Current exports nest the reading under a `weight` object and put
  // the date in `metaData.calendarDate`; older ones are flat.
  if (has("weight") && !has("totalSteps")) {
    for (const r of rows) {
      const nested = pick<Record<string, unknown>>(r, "weight");
      const holder = nested && typeof nested === "object" ? nested : r;
      const meta = pick<Record<string, unknown>>(r, "metaData");

      const date = toISODate(
        pick(holder, "calendarDate", "date", "timestampGMT") ??
          (meta ? pick(meta, "calendarDate") : undefined) ??
          pick(r, "calendarDate", "date"),
      );
      const raw = num(pick(holder, "weight", "weightInGrams"));
      if (!date || raw === undefined) continue;

      // 40–250 kg is plausible; anything larger is grams.
      let kg = raw > 1000 ? raw / 1000 : raw;
      if (opts_units === "imperial" && raw <= 1000) kg = raw / LB_PER_KG;
      if (kg < 20 || kg > 400) continue;

      bag.weight.push({
        date,
        weightKg: kg,
        bodyFatPct: num(pick(holder, "bodyFat", "bodyFatPercentage")),
        muscleMassKg: normaliseMass(num(pick(holder, "muscleMass"))),
        bodyWaterPct: num(pick(holder, "bodyWater")),
        boneMassKg: normaliseMass(num(pick(holder, "boneMass"))),
      });
      n++;
    }
    return n;
  }

  // VO2max / fitness metrics.
  if (has("vo2MaxValue", "vo2MaxPreciseValue", "vo2MaxRunning", "vo2MaxCycling")) {
    for (const r of rows) {
      const meta = pick<Record<string, unknown>>(r, "metaData");
      const date = toISODate(
        pick(r, "calendarDate", "date") ?? (meta ? pick(meta, "calendarDate") : undefined),
      );
      if (!date) continue;
      const run = num(pick(r, "vo2MaxRunning", "vo2MaxPreciseValue", "vo2MaxValue"));
      const ride = num(pick(r, "vo2MaxCycling"));
      if (run !== undefined) bag.vo2max.push({ date, value: run, sport: "running" });
      if (ride !== undefined) bag.vo2max.push({ date, value: ride, sport: "cycling" });
      if (run !== undefined || ride !== undefined) n++;
    }
    return n;
  }

  // HRV, flat shape.
  if (has("lastNightAvg", "weeklyAvg", "hrvValue")) {
    for (const r of rows) {
      const date = toISODate(pick(r, "calendarDate", "date"));
      const avg = num(pick(r, "lastNightAvg", "hrvValue", "weeklyAvg"));
      if (!date || avg === undefined) continue;
      bag.hrv.push({ date, avgMs: avg, status: pick<string>(r, "status", "hrvStatus") });
      n++;
    }
    return n;
  }

  // Daily wellness summary — the widest shape, so it is tested last.
  if (has("totalSteps", "steps", "totalKilocalories", "restingHeartRate")) {
    for (const r of rows) {
      const date = toISODate(pick(r, "calendarDate", "date", "statisticsStartDate"));
      if (!date) continue;

      // Stress and body battery are aggregates hanging off the record, not
      // fields on it.
      const stressBlock = pick<Record<string, unknown>>(r, "allDayStress");
      const aggregators = stressBlock
        ? pick<Record<string, unknown>[]>(stressBlock, "aggregatorList")
        : undefined;
      const totalStress = Array.isArray(aggregators)
        ? aggregators.find((a) => String(pick(a, "type") ?? "") === "TOTAL")
        : undefined;

      const bb = pick<Record<string, unknown>>(r, "bodyBattery");
      const bbStats = bb ? pick<Record<string, unknown>[]>(bb, "bodyBatteryStatList") : undefined;
      const bbBy = (t: string) =>
        Array.isArray(bbStats)
          ? num(
              pick(
                bbStats.find((s) => String(pick(s, "bodyBatteryStatType") ?? "") === t) ?? {},
                "statsValue",
              ),
            )
          : undefined;

      bag.days.push({
        date,
        steps: num(pick(r, "totalSteps", "steps")),
        caloriesTotal: num(pick(r, "totalKilocalories", "totalCalories", "calories")),
        caloriesActive: num(pick(r, "activeKilocalories", "activeCalories")),
        caloriesBmr: num(pick(r, "bmrKilocalories", "bmrCalories")),
        restingHeartRate: num(pick(r, "restingHeartRate", "restingHr")),
        intensityMinutesModerate: num(pick(r, "moderateIntensityMinutes", "moderateIntensityDuration")),
        intensityMinutesVigorous: num(pick(r, "vigorousIntensityMinutes", "vigorousIntensityDuration")),
        floorsClimbed: num(pick(r, "floorsAscended", "floorsClimbed", "floorsAscendedInMeters")),
        stressAvg:
          num(pick(r, "averageStressLevel", "avgStressLevel")) ??
          (totalStress ? num(pick(totalStress, "averageStressLevel")) : undefined),
        bodyBatteryHigh: num(pick(r, "bodyBatteryHighestValue", "bodyBatteryHigh")) ?? bbBy("HIGHEST"),
        bodyBatteryLow: num(pick(r, "bodyBatteryLowestValue", "bodyBatteryLow")) ?? bbBy("LOWEST"),
      });
      n++;
    }
    return n;
  }

  return 0;
}

/**
 * One record of `*_summarizedActivities.json`.
 *
 * The units in this file are not the ones the field names suggest, and getting
 * them wrong is silent — the numbers stay plausible while being an order of
 * magnitude off. Verified against a real export by cross-checking
 * `bmrCalories` against `duration × dailyBMR/1440`:
 *
 *   duration, movingDuration, elapsedDuration → milliseconds
 *   distance, elevationGain/Loss             → centimetres
 *   calories, bmrCalories                    → KILOJOULES, not kcal
 *   startTimeLocal                           → epoch ms pre-shifted to local,
 *                                              so read it as if it were UTC
 */
function readSummarizedActivity(r: Record<string, unknown>): ActivityRecord | undefined {
  const localMs = num(pick(r, "startTimeLocal"));
  const date =
    localMs !== undefined
      ? new Date(localMs).toISOString().slice(0, 10)
      : toISODate(pick(r, "beginTimestamp", "startTimeGmt"));
  if (!date) return undefined;

  // `duration` is the activity timer and is the right notion of session length.
  // `movingDuration` is 0 for anything stationary — indoor cardio, strength —
  // and badly undercounts non-GPS work (one 20.5 min session reports 8.6), so
  // it is only a fallback. Zeros are treated as absent, not as a real duration.
  const durationMs = firstPositive(
    num(pick(r, "duration")),
    num(pick(r, "movingDuration")),
    num(pick(r, "elapsedDuration")),
  );
  if (durationMs === undefined) return undefined;
  const durationMin = durationMs / 60000;

  const distanceCm = num(pick(r, "distance"));
  const distanceKm = distanceCm && distanceCm > 0 ? distanceCm / 100_000 : undefined;

  const elevCm = num(pick(r, "elevationGain"));
  const rawType = String(pick(r, "activityType") ?? "");
  const title = (pick<string>(r, "name") ?? "").trim() || undefined;

  return {
    date,
    type: normaliseActivityType(rawType, title),
    rawType: rawType || undefined,
    title,
    durationMin,
    distanceKm,
    calories: kjToKcal(num(pick(r, "calories"))),
    avgHr: num(pick(r, "avgHr")),
    maxHr: num(pick(r, "maxHr")),
    elevationGainM: elevCm !== undefined ? elevCm / 100 : undefined,
    aerobicTE: num(pick(r, "aerobicTrainingEffect")),
    anaerobicTE: num(pick(r, "anaerobicTrainingEffect")),
    avgCadence: num(pick(r, "avgDoubleCadence", "avgRunCadence", "avgBikeCadence")),
    paceMinPerKm:
      distanceKm && distanceKm > 0.05 ? clamp(durationMin / distanceKm, 1, 60) : undefined,
  };
}

const KJ_PER_KCAL = 4.184;

function kjToKcal(kj: number | undefined): number | undefined {
  return kj === undefined ? undefined : kj / KJ_PER_KCAL;
}

/** First value that is present and greater than zero. */
function firstPositive(...values: (number | undefined)[]): number | undefined {
  for (const v of values) if (v !== undefined && v > 0) return v;
  return undefined;
}

/** Garmin reports muscle/bone mass in grams in most exports. */
function normaliseMass(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  return v > 500 ? v / 1000 : v;
}

function sum(xs: (number | undefined)[]): number | undefined {
  const present = xs.filter((x): x is number => x !== undefined);
  return present.length ? present.reduce((a, b) => a + b, 0) : undefined;
}

// Module-level unit hint, set for the duration of one import. Weight records
// live deep inside the JSON router where threading options would mean plumbing
// an argument through every branch for one field.
let opts_units: "metric" | "imperial" = "metric";

/* ── entry point ────────────────────────────────────────────────────────── */

export interface ImportFile {
  name: string;
  /** Text for csv/json; bytes for zip. */
  text?: string;
  bytes?: Uint8Array;
}

export async function buildDataset(
  files: ImportFile[],
  opts: ParseOptions = {},
): Promise<GarminDataset> {
  opts_units = opts.units ?? "metric";

  const bag: Bag = { days: [], sleep: [], weight: [], activities: [], vo2max: [], hrv: [] };
  const sources: string[] = [];
  const skipped: string[] = [];
  const harvested: Partial<UserProfile> = {};

  // Expand archives first so nested members are treated as ordinary files.
  const flat: ImportFile[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) && f.bytes) {
      try {
        const entries = unzipSync(f.bytes);
        for (const [name, data] of Object.entries(entries)) {
          if (!data.length || name.endsWith("/")) continue;
          if (!/\.(json|csv)$/i.test(name)) continue;
          flat.push({ name, text: strFromU8(data) });
        }
        sources.push(f.name);
      } catch {
        skipped.push(`${f.name} (could not be unzipped)`);
      }
    } else {
      flat.push(f);
    }
  }

  for (const f of flat) {
    const text = f.text;
    if (!text) {
      skipped.push(f.name);
      continue;
    }

    try {
      if (/\.csv$/i.test(f.name)) {
        const headers = (text.split(/\r?\n/, 1)[0] ?? "").split(",").map((h) => h.replace(/"/g, ""));
        if (looksLikeActivitiesCsv(headers)) {
          const acts = parseActivitiesCsv(text, opts);
          if (acts.length) {
            bag.activities.push(...acts);
            sources.push(f.name);
            continue;
          }
        }
        skipped.push(f.name);
        continue;
      }

      if (/\.json$/i.test(f.name)) {
        const parsed: unknown = JSON.parse(text);

        // Profile files carry no time series, so they must be read separately
        // or they would be reported as skipped despite being understood.
        const before = { ...harvested };
        harvestProfile(parsed, harvested);
        const learnedSomething = Object.keys(harvested).some(
          (k) => (harvested as Record<string, unknown>)[k] !== (before as Record<string, unknown>)[k],
        );

        const arrays = collectRecordArrays(parsed);
        let absorbed = 0;
        for (const arr of arrays) absorbed += routeJsonArray(arr, bag);

        if (absorbed > 0 || learnedSomething) sources.push(f.name);
        else skipped.push(f.name);
        continue;
      }

      skipped.push(f.name);
    } catch {
      skipped.push(`${f.name} (unreadable)`);
    }
  }

  dedupeAll(bag);
  // Caller-supplied values win over harvested ones: if the user has corrected
  // their height in the Profile panel, a re-import must not silently undo it.
  return finalise(bag, sources, skipped, { ...harvested, ...opts.profile }, false);
}

/**
 * Walks a parsed JSON value and yields every array-of-objects it contains.
 *
 * Recurses *into* array elements as well as object values, because the
 * activities file wraps its payload as `[{ summarizedActivitiesExport: [...] }]`
 * — a one-element array whose only member holds the real array. Stopping at the
 * outer array would find nothing routable and skip the whole file.
 *
 * The outer array is still yielded; it simply matches no branch and is ignored.
 */
function collectRecordArrays(value: unknown, depth = 0): Record<string, unknown>[][] {
  if (depth > 5 || value === null || typeof value !== "object") return [];

  const out: Record<string, unknown>[][] = [];

  if (Array.isArray(value)) {
    const objects = value.filter((v) => v && typeof v === "object" && !Array.isArray(v));
    if (objects.length) out.push(value as Record<string, unknown>[]);

    // Only worth descending when the array is a thin wrapper; a 500-element
    // array of daily records has nothing useful nested inside it.
    if (objects.length <= 4) {
      for (const v of objects) out.push(...collectRecordArrays(v, depth + 1));
    }
    return out;
  }

  for (const v of Object.values(value as Record<string, unknown>)) {
    out.push(...collectRecordArrays(v, depth + 1));
  }
  return out;
}

/**
 * Profile facts, which Garmin scatters across three single-object files rather
 * than putting in any of the time series.
 *
 * Worth harvesting because every calorie number in the app depends on height,
 * age and sex, and the alternative is making the user re-enter what the export
 * already knows.
 */
function harvestProfile(value: unknown, into: Partial<UserProfile>, depth = 0): void {
  if (depth > 4 || value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const v of value) harvestProfile(v, into, depth + 1);
    return;
  }

  const r = value as Record<string, unknown>;

  const gender = String(pick(r, "gender") ?? "").toUpperCase();
  if (gender === "MALE" || gender === "FEMALE") into.sex = gender.toLowerCase() as "male" | "female";

  const birth = pick<string>(r, "birthDate");
  if (birth) {
    const age = yearsSince(birth);
    if (age !== undefined && age >= 10 && age <= 100) into.age = age;
  }

  const height = num(pick(r, "height"));
  if (height !== undefined && height > 100 && height < 250) into.heightCm = height;

  // `heartRateZones.json` — the watch's own zones beat any %-of-max estimate,
  // because these are what the device used when it recorded the sessions.
  const maxHr = num(pick(r, "maxHeartRateUsed", "maxHeartRate"));
  if (maxHr !== undefined && maxHr > 120 && maxHr < 230) into.maxHr = maxHr;

  const floors = [1, 2, 3, 4, 5]
    .map((i) => num(pick(r, `zone${i}Floor`)))
    .filter((v): v is number => v !== undefined);
  if (floors.length === 5) into.zoneFloors = floors;

  for (const v of Object.values(r)) harvestProfile(v, into, depth + 1);
}

function yearsSince(iso: string): number | undefined {
  const born = new Date(iso);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

/** Garmin's date ranges overlap between files; last write wins per day. */
function dedupeAll(bag: Bag) {
  bag.days = dedupeByDate(bag.days);
  bag.sleep = dedupeByDate(bag.sleep);
  bag.weight = dedupeByDate(bag.weight);
  bag.hrv = dedupeByDate(bag.hrv);
  bag.vo2max = dedupeBy(bag.vo2max, (r) => `${r.date}|${r.sport ?? ""}`);
  bag.activities = dedupeBy(
    bag.activities,
    (a) => `${a.date}|${a.type}|${a.durationMin.toFixed(2)}|${a.calories ?? ""}`,
  );
}

function dedupeByDate<T extends { date: ISODate }>(rows: T[]): T[] {
  return dedupeBy(rows, (r) => r.date);
}

function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return [...m.values()].sort((a, b) =>
    String((a as { date: string }).date).localeCompare(String((b as { date: string }).date)),
  );
}

export function finalise(
  bag: Bag,
  sources: string[],
  skipped: string[],
  profileOverride: Partial<UserProfile> | undefined,
  isDemo: boolean,
): GarminDataset {
  const allDates = [
    ...bag.days.map((d) => d.date),
    ...bag.activities.map((a) => a.date),
    ...bag.sleep.map((s) => s.date),
    ...bag.weight.map((w) => w.date),
  ].sort();

  const latestWeight = bag.weight.at(-1);

  const profile: UserProfile = {
    heightCm: profileOverride?.heightCm ?? 178,
    age: profileOverride?.age ?? 34,
    sex: profileOverride?.sex ?? "male",
    startWeightKg: profileOverride?.startWeightKg ?? latestWeight?.weightKg ?? 82,
    bodyFatPct: profileOverride?.bodyFatPct ?? latestWeight?.bodyFatPct,
    maxHr: profileOverride?.maxHr,
    zoneFloors: profileOverride?.zoneFloors,
    weightFromExport: latestWeight !== undefined,
  };

  return {
    ...bag,
    profile,
    meta: {
      isDemo,
      sources,
      skipped,
      firstDate: allDates[0],
      lastDate: allDates.at(-1),
    },
  };
}
