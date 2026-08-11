/**
 * Canonical shape for everything the dashboard reads.
 *
 * Garmin's own export is a moving target — the CSV column set changes with
 * locale and account age, and the DI_CONNECT JSON filenames carry account ids.
 * So nothing above this layer touches Garmin's vocabulary: parsers normalise
 * into these types, and the UI only ever sees these.
 *
 * Dates are ISO `YYYY-MM-DD` local calendar days throughout. Health data is
 * lived in local time — an activity at 11pm belongs to that day, not to the
 * UTC day it happens to fall in.
 */

export type ISODate = string;

/** Every unit in the app is metric internally; display converts at the edge. */
export interface DayRecord {
  date: ISODate;
  steps?: number;
  /** Total burn Garmin attributes to the day, kcal. */
  caloriesTotal?: number;
  caloriesActive?: number;
  /** Garmin's own resting figure for the day, for reconciliation. */
  caloriesBmr?: number;
  restingHeartRate?: number;
  /** Garmin reports these separately; we keep both and sum for load. */
  intensityMinutesModerate?: number;
  intensityMinutesVigorous?: number;
  floorsClimbed?: number;
  stressAvg?: number;
  bodyBatteryHigh?: number;
  bodyBatteryLow?: number;
}

export interface SleepRecord {
  date: ISODate;
  /** Minutes. Garmin exports seconds; parsers convert. */
  totalMinutes: number;
  deepMinutes?: number;
  lightMinutes?: number;
  remMinutes?: number;
  awakeMinutes?: number;
  /** 0–100 where present. Older exports omit it entirely. */
  score?: number;
  avgOvernightHrv?: number;
  restingHeartRate?: number;
}

export interface WeightRecord {
  date: ISODate;
  /** Kilograms. */
  weightKg: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  bodyWaterPct?: number;
  boneMassKg?: number;
}

export interface ActivityRecord {
  date: ISODate;
  /** Normalised bucket — see `normaliseActivityType`. */
  type: ActivityType;
  /** Raw Garmin label, kept for display so nothing is lost in normalisation. */
  rawType?: string;
  title?: string;
  durationMin: number;
  distanceKm?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  elevationGainM?: number;
  /** Garmin's 0–5 aerobic training effect. */
  aerobicTE?: number;
  anaerobicTE?: number;
  /** Minutes per kilometre, derived when distance and duration allow. */
  paceMinPerKm?: number;
  avgCadence?: number;
}

export type ActivityType =
  | "run"
  | "ride"
  | "swim"
  | "walk"
  | "hike"
  | "strength"
  | "cardio"
  | "martial"
  | "yoga"
  | "other";

export interface Vo2MaxRecord {
  date: ISODate;
  value: number;
  /** Garmin tracks running and cycling VO2max separately. */
  sport?: "running" | "cycling";
}

export interface HrvRecord {
  date: ISODate;
  /** Overnight average HRV in ms (Garmin's `lastNightAvg`). */
  avgMs: number;
  status?: string;
}

/** Everything the dashboard needs, in one bag. */
export interface GarminDataset {
  days: DayRecord[];
  sleep: SleepRecord[];
  weight: WeightRecord[];
  activities: ActivityRecord[];
  vo2max: Vo2MaxRecord[];
  hrv: HrvRecord[];
  profile: UserProfile;
  meta: DatasetMeta;
}

export interface DatasetMeta {
  /** True when the data is the built-in sample rather than the user's export. */
  isDemo: boolean;
  /** Filenames actually consumed, so the UI can show what it understood. */
  sources: string[];
  /** Files seen but not recognised — surfaced so import failures aren't silent. */
  skipped: string[];
  firstDate?: ISODate;
  lastDate?: ISODate;
}

export interface UserProfile {
  /** Centimetres. */
  heightCm: number;
  age: number;
  sex: "male" | "female";
  /** Kilograms — seeded from the most recent weigh-in when one exists. */
  startWeightKg: number;
  bodyFatPct?: number;
  /** Beats per minute; used to scale heart-rate zones. */
  maxHr?: number;
  /**
   * The five zone floors in bpm, straight from the watch's own settings.
   * Garmin exports these in `heartRateZones.json`, and they beat any
   * percentage-of-max estimate because they are what the device actually used
   * when it recorded the sessions.
   */
  zoneFloors?: number[];
  /** True when weight came from the export rather than a fallback default. */
  weightFromExport?: boolean;
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  walk: "Walk",
  hike: "Hike",
  strength: "Strength",
  cardio: "Cardio",
  martial: "Martial arts",
  yoga: "Yoga",
  other: "Other",
};

/**
 * Garmin emits dozens of activity type strings ("lap_swimming",
 * "indoor_cycling", "trail_running", localised variants…). Collapse them into
 * buckets the dashboard can actually chart, longest-match first so
 * "trail_running" doesn't get swallowed by a bare "walk" test.
 *
 * `title` is a fallback signal, not decoration. Garmin files anything without a
 * dedicated activity profile — martial arts, class-based training — as plain
 * "other", so a real training week can end up 56% "Other" while the session the
 * person actually did is named right there in the title.
 */
export function normaliseActivityType(
  raw: string | undefined,
  title?: string,
): ActivityType {
  const direct = matchActivityType(raw);
  if (direct !== "other") return direct;

  const fromTitle = matchActivityType(title);
  return fromTitle !== "other" ? fromTitle : "other";
}

function matchActivityType(raw: string | undefined): ActivityType {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "other";
  // Combat sports before the generic tests: "kickboxing" must not read as "box".
  if (/muay|thai box|kickbox|boxing|martial|mma|bjj|jiu.?jitsu|judo|karate|taekwondo|wrestl|grappl/.test(s))
    return "martial";
  if (/tread|jog|run/.test(s)) return "run";
  if (/bike|cycl|spin/.test(s)) return "ride";
  if (/swim/.test(s)) return "swim";
  if (/hike|trekking/.test(s)) return "hike";
  if (/walk/.test(s)) return "walk";
  if (/strength|weight|resist|gym/.test(s)) return "strength";
  if (/yoga|pilates|stretch|breath/.test(s)) return "yoga";
  if (/cardio|hiit|elliptical|row|stair|training/.test(s)) return "cardio";
  return "other";
}
