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

    out.push({
      date,
      type: normaliseActivityType(rawType),
      rawType: rawType || undefined,
      title: (pick<string>(r, "title") ?? "").trim() || undefined,
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
 */
function routeJsonArray(rows: Record<string, unknown>[], bag: Bag): number {
  const sample = rows.find((r) => r && typeof r === "object");
  if (!sample) return 0;
  const keys = new Set(Object.keys(sample).map((k) => k.toLowerCase()));
  const has = (...names: string[]) => names.some((n) => keys.has(n.toLowerCase()));

  let n = 0;

  // Sleep: the only shape carrying per-stage second counts.
  if (has("deepSleepSeconds", "sleepTimeSeconds", "sleepStartTimestampGMT", "sleepEndTimestampGMT")) {
    for (const r of rows) {
      const date = toISODate(
        pick(r, "calendarDate", "sleepStartTimestampLocal", "sleepStartTimestampGMT", "date"),
      );
      const total =
        secondsToMinutes(pick(r, "sleepTimeSeconds", "totalSleepSeconds")) ??
        sum([
          secondsToMinutes(pick(r, "deepSleepSeconds")),
          secondsToMinutes(pick(r, "lightSleepSeconds")),
          secondsToMinutes(pick(r, "remSleepSeconds")),
        ]);
      if (!date || !total) continue;

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
          (overall ? num(pick(overall, "value")) : undefined),
        avgOvernightHrv: num(pick(r, "avgOvernightHrv", "averageHrv")),
        restingHeartRate: num(pick(r, "restingHeartRate")),
      });
      n++;
    }
    return n;
  }

  // Weight: grams in most vintages, kilograms in a few.
  if (has("weight") && !has("totalSteps")) {
    for (const r of rows) {
      const date = toISODate(pick(r, "calendarDate", "date", "timestampGMT", "samplePk"));
      const raw = num(pick(r, "weight", "weightInGrams"));
      if (!date || raw === undefined) continue;

      // 40–250 kg is plausible; anything larger is grams.
      let kg = raw > 1000 ? raw / 1000 : raw;
      if (opts_units === "imperial" && raw <= 1000) kg = raw / LB_PER_KG;
      if (kg < 20 || kg > 400) continue;

      bag.weight.push({
        date,
        weightKg: kg,
        bodyFatPct: num(pick(r, "bodyFat", "bodyFatPercentage")),
        muscleMassKg: normaliseMass(num(pick(r, "muscleMass"))),
        bodyWaterPct: num(pick(r, "bodyWater")),
        boneMassKg: normaliseMass(num(pick(r, "boneMass"))),
      });
      n++;
    }
    return n;
  }

  // VO2max / fitness metrics.
  if (has("vo2MaxValue", "vo2MaxPreciseValue", "vo2MaxRunning", "vo2MaxCycling")) {
    for (const r of rows) {
      const date = toISODate(pick(r, "calendarDate", "date"));
      if (!date) continue;
      const run = num(pick(r, "vo2MaxRunning", "vo2MaxPreciseValue", "vo2MaxValue"));
      const ride = num(pick(r, "vo2MaxCycling"));
      if (run !== undefined) bag.vo2max.push({ date, value: run, sport: "running" });
      if (ride !== undefined) bag.vo2max.push({ date, value: ride, sport: "cycling" });
      if (run !== undefined || ride !== undefined) n++;
    }
    return n;
  }

  // HRV.
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
      bag.days.push({
        date,
        steps: num(pick(r, "totalSteps", "steps")),
        caloriesTotal: num(pick(r, "totalKilocalories", "totalCalories", "calories")),
        caloriesActive: num(pick(r, "activeKilocalories", "activeCalories")),
        restingHeartRate: num(pick(r, "restingHeartRate", "restingHr")),
        intensityMinutesModerate: num(pick(r, "moderateIntensityMinutes", "moderateIntensityDuration")),
        intensityMinutesVigorous: num(pick(r, "vigorousIntensityMinutes", "vigorousIntensityDuration")),
        floorsClimbed: num(pick(r, "floorsAscended", "floorsClimbed")),
        stressAvg: num(pick(r, "averageStressLevel", "avgStressLevel")),
        bodyBatteryHigh: num(pick(r, "bodyBatteryHighestValue", "bodyBatteryHigh")),
        bodyBatteryLow: num(pick(r, "bodyBatteryLowestValue", "bodyBatteryLow")),
      });
      n++;
    }
    return n;
  }

  return 0;
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
        // Exports wrap arrays inconsistently; find the first array of objects.
        const arrays = collectRecordArrays(parsed);
        let absorbed = 0;
        for (const arr of arrays) absorbed += routeJsonArray(arr, bag);
        if (absorbed > 0) sources.push(f.name);
        else skipped.push(f.name);
        continue;
      }

      skipped.push(f.name);
    } catch {
      skipped.push(`${f.name} (unreadable)`);
    }
  }

  dedupeAll(bag);
  return finalise(bag, sources, skipped, opts.profile, false);
}

/** Walks a parsed JSON value and yields every array-of-objects it contains. */
function collectRecordArrays(value: unknown, depth = 0): Record<string, unknown>[][] {
  if (depth > 4 || value === null || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.some((v) => v && typeof v === "object" && !Array.isArray(v))
      ? [value as Record<string, unknown>[]]
      : [];
  }

  const out: Record<string, unknown>[][] = [];
  for (const v of Object.values(value as Record<string, unknown>)) {
    out.push(...collectRecordArrays(v, depth + 1));
  }
  return out;
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
