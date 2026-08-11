/**
 * Dynamic body-mass simulation.
 *
 * The "3500 kcal = 1 lb" rule is a straight line, and bodies are not straight
 * lines — it over-predicts loss badly past about twelve weeks. This model is
 * integrated day by day and closes the three loops that flatten a real curve:
 *
 *  1. **Mass loop** — a lighter body costs less to run and less to move, so
 *     BMR and step cost fall as weight falls.
 *  2. **Adaptive thermogenesis** — sustained deficits suppress expenditure
 *     beyond what mass loss explains, and the suppression lags by weeks.
 *  3. **Forbes partitioning** — as fat mass drops, more of each further
 *     kilogram comes from lean tissue, which is far cheaper per kg, so the
 *     same deficit buys less scale movement over time.
 *
 * The result asymptotes toward a plateau, which is what actually happens.
 */

import {
  type BodyState,
  bodyFromWeight,
  clamp,
  computeTdee,
  leanRetentionFactor,
  tissueEnergyDensity,
} from "./energy";
import type { UserProfile } from "../garmin/types";
import { proteinTargetRange, proteinUnit, toDisplayProtein, type UnitSystem } from "../format";

export interface SimulationInputs {
  profile: UserProfile;
  startWeightKg: number;
  startBodyFatPct: number;
  hasBodyComp: boolean;

  /** The levers the user actually moves. */
  intakeKcal: number;
  steps: number;
  exerciseKcalPerDay: number;
  proteinGPerKg: number;
  strengthSessionsPerWeek: number;

  days: number;
  /** Off makes the model naive on purpose, for comparison. */
  modelAdaptation: boolean;
  /** Display only — decides whether warnings say g/kg or g/lb. */
  units?: UnitSystem;
}

export interface SimPoint {
  day: number;
  date: string;
  weightKg: number;
  fatMassKg: number;
  leanMassKg: number;
  bodyFatPct: number;
  tdee: number;
  deficit: number;
  adaptation: number;
  /** ±1 modelling-uncertainty band, widening with horizon. */
  loKg: number;
  hiKg: number;
}

export interface SimulationResult {
  points: SimPoint[];
  start: SimPoint;
  end: SimPoint;
  totalChangeKg: number;
  /** Mean kg/week across the horizon. */
  avgRateKgPerWeek: number;
  /** Rate over the final 4 weeks — what it feels like once adaptation bites. */
  terminalRateKgPerWeek: number;
  initialTdee: number;
  finalTdee: number;
  warnings: Warning[];
}

export interface Warning {
  level: "info" | "caution" | "risk";
  title: string;
  detail: string;
}

/** Adaptation approaches its floor with a ~4 week time constant. */
const ADAPT_TAU_DAYS = 28;
/** Maximum suppression of expenditure under a sustained aggressive deficit. */
const MAX_ADAPTATION = 0.15;

export function simulate(input: SimulationInputs, startDate = new Date()): SimulationResult {
  const {
    profile,
    startWeightKg,
    startBodyFatPct,
    hasBodyComp,
    intakeKcal,
    steps,
    exerciseKcalPerDay,
    proteinGPerKg,
    strengthSessionsPerWeek,
    days,
    modelAdaptation,
  } = input;

  let body: BodyState = bodyFromWeight(startWeightKg, startBodyFatPct);
  const retention = leanRetentionFactor(proteinGPerKg, strengthSessionsPerWeek);

  // Protein as a share of intake drives TEF.
  const proteinKcal = proteinGPerKg * startWeightKg * 4;
  const proteinFraction = clamp(proteinKcal / Math.max(intakeKcal, 800), 0, 0.6);

  let adaptation = 1;
  const points: SimPoint[] = [];
  let initialTdee = 0;
  let finalTdee = 0;

  for (let day = 0; day <= days; day++) {
    const tdee = computeTdee({
      body,
      profile,
      hasBodyComp,
      steps,
      exerciseKcalPerDay,
      intakeKcal,
      proteinFractionOfKcal: proteinFraction,
      adaptation,
    });

    if (day === 0) initialTdee = tdee.total;
    finalTdee = tdee.total;

    const deficit = intakeKcal - tdee.total;

    // Uncertainty grows with the square root of the horizon — errors in intake
    // estimation and expenditure partly cancel rather than compounding, so a
    // linear cone would overstate how little we know at week 12.
    const sigma = 0.9 * Math.sqrt(day / 30) + 0.25;

    points.push({
      day,
      date: addDays(startDate, day),
      weightKg: body.weightKg,
      fatMassKg: body.fatMassKg,
      leanMassKg: body.leanMassKg,
      bodyFatPct: (body.fatMassKg / body.weightKg) * 100,
      tdee: tdee.total,
      deficit,
      adaptation,
      loKg: body.weightKg - sigma,
      hiKg: body.weightKg + sigma,
    });

    if (day === days) break;

    // ── advance one day ──────────────────────────────────────────────────
    const { kcalPerKg, leanFraction } = tissueEnergyDensity(body.fatMassKg, retention);
    const dWeight = deficit / kcalPerKg;

    const dLean = dWeight * leanFraction;
    const dFat = dWeight - dLean;

    body = {
      weightKg: Math.max(30, body.weightKg + dWeight),
      fatMassKg: Math.max(2, body.fatMassKg + dFat),
      leanMassKg: Math.max(25, body.leanMassKg + dLean),
    };

    if (modelAdaptation) {
      // Target suppression scales with how aggressive the deficit is relative
      // to maintenance, saturating at a 25% deficit.
      const deficitFraction = clamp(-deficit / Math.max(tdee.total, 1), 0, 0.25);
      const target = 1 - MAX_ADAPTATION * (deficitFraction / 0.25);
      adaptation += (target - adaptation) / ADAPT_TAU_DAYS;
    }
  }

  const start = points[0];
  const end = points[points.length - 1];
  const weeks = days / 7;

  const fourWeeksAgo = points[Math.max(0, points.length - 29)];
  const terminalWeeks = (end.day - fourWeeksAgo.day) / 7;

  return {
    points,
    start,
    end,
    totalChangeKg: end.weightKg - start.weightKg,
    avgRateKgPerWeek: weeks > 0 ? (end.weightKg - start.weightKg) / weeks : 0,
    terminalRateKgPerWeek:
      terminalWeeks > 0 ? (end.weightKg - fourWeeksAgo.weightKg) / terminalWeeks : 0,
    initialTdee,
    finalTdee,
    warnings: buildWarnings(input, points, initialTdee),
  };
}

function buildWarnings(input: SimulationInputs, points: SimPoint[], tdee: number): Warning[] {
  const out: Warning[] = [];
  const start = points[0];
  const end = points[points.length - 1];

  const weeklyRatePct =
    (Math.abs(end.weightKg - start.weightKg) / (points.length / 7) / start.weightKg) * 100;

  const floor = input.profile.sex === "male" ? 1500 : 1200;
  if (input.intakeKcal < floor) {
    out.push({
      level: "risk",
      title: `Intake below ${floor} kcal`,
      detail:
        "Sustained intake this low makes micronutrient adequacy hard and accelerates lean-mass loss. Worth a conversation with a doctor or dietitian before running it for weeks.",
    });
  }

  if (weeklyRatePct > 1) {
    out.push({
      level: "caution",
      title: `Losing ${weeklyRatePct.toFixed(1)}% of body weight per week`,
      detail:
        "Above roughly 1% per week, the share of loss coming from lean tissue climbs steeply. Easing the deficit usually preserves more muscle for a similar fat loss.",
    });
  }

  if (end.bodyFatPct < (input.profile.sex === "male" ? 8 : 16)) {
    out.push({
      level: "caution",
      title: `Projected body fat reaches ${end.bodyFatPct.toFixed(1)}%`,
      detail:
        "This is competition-lean territory. The model's partitioning assumptions are least reliable at these levels and real-world adherence gets much harder.",
    });
  }

  if (input.proteinGPerKg < 1.4 && end.weightKg < start.weightKg) {
    out.push({
      level: "info",
      title: "Protein below the muscle-sparing range",
      detail: `At ${toDisplayProtein(input.proteinGPerKg, input.units ?? "metric").toFixed(2)} ${proteinUnit(input.units ?? "metric")} you are under the ${proteinTargetRange(input.units ?? "metric")} that best protects lean mass in a deficit. Raising it changes the fat/lean split without changing calories.`,
    });
  }

  const deficitPct = ((tdee - input.intakeKcal) / tdee) * 100;
  if (deficitPct > 0 && deficitPct < 5) {
    out.push({
      level: "info",
      title: "Deficit is inside the noise floor",
      detail:
        "A deficit under about 5% of maintenance is smaller than day-to-day error in both intake and expenditure. Real progress will be hard to distinguish from measurement drift.",
    });
  }

  if (input.intakeKcal > tdee) {
    out.push({
      level: "info",
      title: "Modelling a surplus",
      detail:
        "Intake exceeds maintenance, so this projects gain. Partitioning in a surplus is more favourable than the Forbes curve assumes when training is progressive, so treat the lean/fat split as pessimistic.",
    });
  }

  return out;
}

/**
 * Inverse solve: the intake that lands on `targetWeightKg` in `days`.
 * The forward model has no closed-form inverse — adaptation makes it path
 * dependent — so this bisects on the forward simulation. ~40 iterations is
 * well under a millisecond and converges to a single kcal.
 */
export function solveIntakeForTarget(
  base: SimulationInputs,
  targetWeightKg: number,
  days: number,
): { intakeKcal: number; achievable: boolean } {
  let lo = 800;
  let hi = 6000;

  const endWeight = (intake: number) =>
    simulate({ ...base, intakeKcal: intake, days }).end.weightKg;

  const atLo = endWeight(lo);
  const atHi = endWeight(hi);

  // Target outside what any intake reaches in this window.
  if (targetWeightKg < atLo) return { intakeKcal: lo, achievable: false };
  if (targetWeightKg > atHi) return { intakeKcal: hi, achievable: false };

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (endWeight(mid) < targetWeightKg) lo = mid;
    else hi = mid;
  }
  return { intakeKcal: Math.round((lo + hi) / 2), achievable: true };
}

/**
 * Days until `targetWeightKg` at the current settings, or null if the
 * trajectory never reaches it within two years.
 */
export function daysToTarget(base: SimulationInputs, targetWeightKg: number): number | null {
  const horizon = 730;
  const { points } = simulate({ ...base, days: horizon });
  const losing = points[horizon].weightKg < points[0].weightKg;

  for (const p of points) {
    if (losing ? p.weightKg <= targetWeightKg : p.weightKg >= targetWeightKg) return p.day;
  }
  return null;
}

function addDays(start: Date, days: number): string {
  const d = new Date(start.getTime());
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
