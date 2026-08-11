/**
 * Energy expenditure model.
 *
 * TDEE is built up from named components rather than from an "activity
 * multiplier", because the whole point of having Garmin data is that we can
 * measure the parts a multiplier only guesses at. Every component is
 * documented with its source so the numbers can be argued with.
 *
 *   TDEE = BMR + NEAT(steps) + baseline NEAT + EAT(activities) + TEF(intake)
 *
 * Double-counting is the main hazard when composing a model this way, and it
 * is handled explicitly in two places: step cost uses the *net* cost of
 * walking, and activity calories have their resting component subtracted.
 */

import type { ActivityRecord, UserProfile } from "../garmin/types";

/** Net cost of walking, kcal per kg of body mass per km. Excludes resting. */
const WALK_KCAL_PER_KG_KM = 0.53;
/** Steps per km at a typical adult stride (~0.72 m). */
const STEPS_PER_KM = 1389;

/** Tissue energy densities, kcal/kg. Lean tissue is mostly water, so it is cheap. */
export const KCAL_PER_KG_FAT = 9440;
export const KCAL_PER_KG_LEAN = 1816;

/** Forbes' constant, kg. Governs how a weight change splits into fat and lean. */
const FORBES_C = 10.4;

export interface BodyState {
  weightKg: number;
  fatMassKg: number;
  leanMassKg: number;
}

/**
 * Mifflin-St Jeor. The default for anyone without a body-composition reading —
 * it is the best-validated predictive equation for the general population.
 */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: "male" | "female"): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/**
 * Katch-McArdle. Preferred whenever body fat is actually known, because it
 * scales with lean mass and so stays accurate at the extremes where
 * Mifflin-St Jeor drifts.
 */
export function katchMcArdle(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

export function restingMetabolicRate(body: BodyState, profile: UserProfile, hasBodyComp: boolean): number {
  return hasBodyComp
    ? katchMcArdle(body.leanMassKg)
    : mifflinStJeor(body.weightKg, profile.heightCm, profile.age, profile.sex);
}

/** Deurenberg estimate, used only when the scale never reported body fat. */
export function estimateBodyFatPct(weightKg: number, heightCm: number, age: number, sex: "male" | "female"): number {
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  const pct = 1.2 * bmi + 0.23 * age - 10.8 * (sex === "male" ? 1 : 0) - 5.4;
  return clamp(pct, 4, 60);
}

export function bodyFromWeight(weightKg: number, bodyFatPct: number): BodyState {
  const fatMassKg = (weightKg * bodyFatPct) / 100;
  return { weightKg, fatMassKg, leanMassKg: weightKg - fatMassKg };
}

/** Net kcal burned by a day's steps, over and above resting. */
export function stepEnergy(steps: number, weightKg: number): number {
  return (steps / STEPS_PER_KM) * WALK_KCAL_PER_KG_KM * weightKg;
}

/**
 * Thermic effect of food, from macro composition.
 * Protein ~25%, carbohydrate ~8%, fat ~2%; the non-protein remainder is
 * assumed to split 60/40 carb/fat.
 */
export function thermicEffect(intakeKcal: number, proteinFractionOfKcal: number): number {
  const p = clamp(proteinFractionOfKcal, 0, 0.6);
  const rate = p * 0.25 + (1 - p) * (0.6 * 0.08 + 0.4 * 0.02);
  return intakeKcal * rate;
}

/**
 * Mean daily exercise energy from recorded activities, net of the resting
 * burn that would have happened anyway during those minutes.
 */
export function dailyExerciseEnergy(
  activities: ActivityRecord[],
  windowDays: number,
  bmr: number,
  weightKg: number,
): number {
  if (windowDays <= 0) return 0;
  const bmrPerMin = bmr / 1440;

  let net = 0;
  for (const a of activities) {
    const gross = a.calories ?? estimateActivityCalories(a, weightKg);
    net += Math.max(0, gross - bmrPerMin * a.durationMin);
  }
  return net / windowDays;
}

/** MET-based fallback for activities Garmin exported without a calorie figure. */
export function estimateActivityCalories(a: ActivityRecord, weightKg: number): number {
  const met = MET_BY_TYPE[a.type] ?? 6;
  return (met * 3.5 * weightKg * a.durationMin) / 200;
}

const MET_BY_TYPE: Record<string, number> = {
  run: 9.8,
  ride: 7.5,
  swim: 8.3,
  walk: 3.5,
  hike: 6.0,
  strength: 5.0,
  cardio: 7.0,
  martial: 9.5,
  yoga: 3.0,
  other: 5.0,
};

export interface TdeeBreakdown {
  bmr: number;
  /** Non-exercise movement not captured by the step count. */
  baselineNeat: number;
  stepNeat: number;
  exercise: number;
  tef: number;
  total: number;
  /** Multiplier applied to non-TEF components by metabolic adaptation. */
  adaptation: number;
}

export interface TdeeInputs {
  body: BodyState;
  profile: UserProfile;
  hasBodyComp: boolean;
  steps: number;
  exerciseKcalPerDay: number;
  intakeKcal: number;
  proteinFractionOfKcal: number;
  /** 1 = no adaptation, 0.88 = 12% suppressed. */
  adaptation: number;
}

export function computeTdee(i: TdeeInputs): TdeeBreakdown {
  const bmr = restingMetabolicRate(i.body, i.profile, i.hasBodyComp);
  // Standing, fidgeting, and everything a wrist step count misses.
  const baselineNeat = bmr * 0.1;
  const stepNeat = stepEnergy(i.steps, i.body.weightKg);
  const tef = thermicEffect(i.intakeKcal, i.proteinFractionOfKcal);

  // Adaptation suppresses metabolic output, not the cost of digesting food.
  const adapted = (bmr + baselineNeat + stepNeat + i.exerciseKcalPerDay) * i.adaptation;

  return {
    bmr: bmr * i.adaptation,
    baselineNeat: baselineNeat * i.adaptation,
    stepNeat: stepNeat * i.adaptation,
    exercise: i.exerciseKcalPerDay * i.adaptation,
    tef,
    total: adapted + tef,
    adaptation: i.adaptation,
  };
}

/**
 * Forbes partitioning: the leaner you are, the more of a deficit comes out of
 * lean tissue, which is why the same deficit slows down as you approach a
 * lower body fat. Returns the effective kcal cost of one kg of body mass.
 *
 * `leanRetention` above 1 shifts loss toward fat — the effect of adequate
 * protein and resistance training.
 */
export function tissueEnergyDensity(fatMassKg: number, leanRetention: number): {
  kcalPerKg: number;
  leanFraction: number;
} {
  const fm = Math.max(1.5, fatMassKg);
  const rawLeanFraction = FORBES_C / (FORBES_C + fm);
  const leanFraction = clamp(rawLeanFraction / clamp(leanRetention, 0.5, 1.6), 0.02, 0.75);
  return {
    kcalPerKg: leanFraction * KCAL_PER_KG_LEAN + (1 - leanFraction) * KCAL_PER_KG_FAT,
    leanFraction,
  };
}

/**
 * How much protein intake and resistance training protect lean mass.
 * 1.0 is neutral; ~1.35 is the practical ceiling from the literature
 * (high protein + regular lifting).
 */
export function leanRetentionFactor(proteinGPerKg: number, strengthSessionsPerWeek: number): number {
  const proteinTerm = clamp((proteinGPerKg - 0.8) / 1.2, 0, 1) * 0.22;
  const trainingTerm = clamp(strengthSessionsPerWeek / 3, 0, 1) * 0.15;
  return 1 + proteinTerm + trainingTerm;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
