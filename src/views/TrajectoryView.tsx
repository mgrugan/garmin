/**
 * The Trajectory — where the dashboard stops reporting and starts answering
 * "what happens if".
 *
 * Every control here is seeded from the user's own eight-week baseline rather
 * than from a default, so the first thing they see is a projection of the life
 * they are already living. Moving a slider is then a genuine counterfactual:
 * this is what changes if I eat 200 fewer calories, or walk 2,000 more steps.
 *
 * The model is documented in `lib/model/weight.ts`. The short version: it is
 * integrated day by day, a lighter body burns less, deficits suppress
 * expenditure with a lag, and the fat/lean split follows Forbes — so the curve
 * flattens the way real ones do instead of running off the bottom of the chart.
 */

import { useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  Barbell,
  Bathtub,
  FireSimple,
  Flag,
  Info,
  PersonSimpleWalk,
  Warning,
} from "@phosphor-icons/react";
import { NumberSlider, Panel, Row, StatTile, type AccentName } from "@/components/primitives";
import { TrajectoryChart } from "@/components/charts/TrajectoryChart";
import { TdeeSplitChart } from "@/components/charts/panels";
import { Switch } from "@/components/ui/switch";
import type { Deck } from "@/lib/deck";
import type { GarminDataset } from "@/lib/garmin/types";
import {
  daysToTarget,
  simulate,
  solveIntakeForTarget,
  type SimulationInputs,
} from "@/lib/model/weight";
import { bodyFromWeight, computeTdee, leanRetentionFactor } from "@/lib/model/energy";
import {
  horizonPhrase,
  kgUnit,
  signed,
  toDisplayMass,
  type UnitSystem,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const HORIZONS = [
  { weeks: 12, label: "12 wk" },
  { weeks: 26, label: "26 wk" },
  { weeks: 52, label: "1 yr" },
  { weeks: 104, label: "2 yr" },
];

export function TrajectoryView({
  deck,
  dataset,
  units,
}: {
  deck: Deck;
  dataset: GarminDataset;
  units: UnitSystem;
}) {
  const b = deck.baseline;

  // The user's stated intake is the anchor the whole panel opens on.
  const [intake, setIntake] = useState(2200);
  const [steps, setSteps] = useState(b.avgSteps);
  const [exercise, setExercise] = useState(Math.round(b.exerciseKcalPerDay));
  const [protein, setProtein] = useState(1.6);
  const [strength, setStrength] = useState(Math.round(b.strengthSessionsPerWeek * 10) / 10);
  const [weeks, setWeeks] = useState(26);
  const [adaptation, setAdaptation] = useState(true);
  const [goalKg, setGoalKg] = useState(() => Math.round((b.weightKg - 8) * 10) / 10);

  const inputs: SimulationInputs = useMemo(
    () => ({
      profile: dataset.profile,
      startWeightKg: b.weightKg,
      startBodyFatPct: b.bodyFatPct,
      hasBodyComp: b.hasBodyComp,
      intakeKcal: intake,
      steps,
      exerciseKcalPerDay: exercise,
      proteinGPerKg: protein,
      strengthSessionsPerWeek: strength,
      days: weeks * 7,
      modelAdaptation: adaptation,
    }),
    [dataset.profile, b, intake, steps, exercise, protein, strength, weeks, adaptation],
  );

  const sim = useMemo(() => simulate(inputs), [inputs]);

  const goalEta = useMemo(() => daysToTarget(inputs, goalKg), [inputs, goalKg]);

  const solved = useMemo(
    () => solveIntakeForTarget(inputs, goalKg, weeks * 7),
    [inputs, goalKg, weeks],
  );

  // Day-zero energy split, for the breakdown panel.
  const breakdown = useMemo(() => {
    const body = bodyFromWeight(b.weightKg, b.bodyFatPct);
    return computeTdee({
      body,
      profile: dataset.profile,
      hasBodyComp: b.hasBodyComp,
      steps,
      exerciseKcalPerDay: exercise,
      intakeKcal: intake,
      proteinFractionOfKcal: Math.min(0.6, (protein * b.weightKg * 4) / Math.max(intake, 800)),
      adaptation: 1,
    });
  }, [b, dataset.profile, steps, exercise, intake, protein]);

  const unit = kgUnit(units);
  const deficit = intake - sim.initialTdee;
  const dirty =
    intake !== 2200 ||
    steps !== b.avgSteps ||
    exercise !== Math.round(b.exerciseKcalPerDay) ||
    protein !== 1.6;

  const reset = () => {
    setIntake(2200);
    setSteps(b.avgSteps);
    setExercise(Math.round(b.exerciseKcalPerDay));
    setProtein(1.6);
    setStrength(Math.round(b.strengthSessionsPerWeek * 10) / 10);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── headline readouts ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Projected · ${horizonPhrase(weeks * 7)}`}
          value={toDisplayMass(sim.end.weightKg, units).toFixed(1)}
          unit={unit}
          accent="recovery"
          footnote={`from ${toDisplayMass(sim.start.weightKg, units).toFixed(1)} ${unit} today`}
        />
        <StatTile
          label="Total change"
          value={signed(toDisplayMass(sim.totalChangeKg, units), 1)}
          unit={unit}
          accent={sim.totalChangeKg < 0 ? "load" : "energy"}
          footnote={`${signed(toDisplayMass(sim.avgRateKgPerWeek, units), 2)} ${unit}/week average`}
        />
        <StatTile
          label="Daily balance"
          value={signed(Math.round(deficit), 0)}
          unit="kcal"
          accent={deficit < 0 ? "load" : "energy"}
          footnote={`maintenance is ${Math.round(sim.initialTdee).toLocaleString()} kcal today`}
        />
        <StatTile
          label="Body fat"
          value={sim.end.bodyFatPct.toFixed(1)}
          unit="%"
          accent="mass"
          footnote={`${signed(sim.end.bodyFatPct - sim.start.bodyFatPct, 1)} pts from ${sim.start.bodyFatPct.toFixed(1)}%`}
        />
      </div>

      {/* ── the chart ─────────────────────────────────────────────────── */}
      <Panel
        label="Trajectory"
        sub={`Recorded body mass through today, then ${horizonPhrase(weeks * 7)} of simulation at the settings below.`}
        actions={
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
            {HORIZONS.map((h) => (
              <button
                key={h.weeks}
                onClick={() => setWeeks(h.weeks)}
                aria-pressed={weeks === h.weeks}
                className={cn(
                  "eyebrow rounded-full px-2.5 py-1.5 transition-colors",
                  weeks === h.weeks
                    ? "bg-load text-on-load"
                    : "text-ink-faint hover:bg-overlay hover:text-ink-muted",
                )}
              >
                {h.label}
              </button>
            ))}
          </div>
        }
      >
        <TrajectoryChart
          history={deck.weight.length > 5 ? deck.weight : dataset.weight}
          simulation={sim.points}
          units={units}
          goalKg={goalKg}
        />
      </Panel>

      {/* items-start: panels hug their content instead of stretching to the
          tallest sibling, which left dead space under the shorter one. */}
      <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_1fr]">
        {/* ── controls ────────────────────────────────────────────────── */}
        <Panel
          label="Assumptions"
          sub="Seeded from your last 8 weeks. Move anything to see the curve above respond."
          actions={
            dirty && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
              >
                <ArrowCounterClockwise size={12} weight="bold" />
                <span className="eyebrow">Reset</span>
              </button>
            )
          }
        >
          <div className="flex flex-col gap-5">
            <Control
              icon={<FireSimple size={15} weight="fill" />}
              label="Daily calories"
              value={intake.toLocaleString()}
              unit="kcal"
              accent="energy"
              hint={
                deficit < 0
                  ? `${Math.abs(Math.round(deficit))} kcal under maintenance`
                  : deficit > 0
                    ? `${Math.round(deficit)} kcal over maintenance`
                    : "at maintenance"
              }
            >
              <NumberSlider
                value={intake}
                onChange={setIntake}
                min={1200}
                max={4000}
                step={25}
                ariaLabel="Daily calorie intake"
              />
            </Control>

            <Control
              icon={<PersonSimpleWalk size={15} weight="fill" />}
              label="Daily steps"
              value={steps.toLocaleString()}
              accent="recovery"
              hint={`your recent average is ${b.avgSteps.toLocaleString()}`}
            >
              <NumberSlider
                value={steps}
                onChange={setSteps}
                min={1000}
                max={25000}
                step={250}
                ariaLabel="Average daily steps"
              />
            </Control>

            <Control
              icon={<Barbell size={15} weight="fill" />}
              label="Training burn"
              value={exercise.toLocaleString()}
              unit="kcal/day"
              accent="load"
              hint={`${Math.round(exercise * 7).toLocaleString()} kcal across a week`}
            >
              <NumberSlider
                value={exercise}
                onChange={setExercise}
                min={0}
                max={1500}
                step={10}
                ariaLabel="Average daily training calories"
              />
            </Control>

            <Control
              icon={<Bathtub size={15} weight="fill" />}
              label="Protein"
              value={protein.toFixed(1)}
              unit="g/kg"
              accent="mass"
              hint={`${Math.round(protein * b.weightKg)} g/day — ${protein >= 1.6 ? "in the muscle-sparing range" : "below the muscle-sparing range"}`}
            >
              <NumberSlider
                value={protein}
                onChange={setProtein}
                min={0.6}
                max={3}
                step={0.1}
                ariaLabel="Protein intake per kilogram of body weight"
              />
            </Control>

            <Control
              icon={<Barbell size={15} weight="fill" />}
              label="Strength sessions"
              value={strength.toFixed(1)}
              unit="per week"
              accent="load"
              hint={`lean retention factor ${leanRetentionFactor(protein, strength).toFixed(2)}×`}
            >
              <NumberSlider
                value={strength}
                onChange={setStrength}
                min={0}
                max={6}
                step={0.5}
                ariaLabel="Strength sessions per week"
              />
            </Control>

            <div className="flex items-start justify-between gap-4 rounded-md border border-line bg-surface px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">Model metabolic adaptation</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
                  Sustained deficits suppress expenditure beyond what lost mass explains. Turning
                  this off gives the naive straight-line answer, which is optimistic by design.
                </p>
              </div>
              <Switch
                checked={adaptation}
                onCheckedChange={setAdaptation}
                aria-label="Model metabolic adaptation"
              />
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          {/* ── goal solver ──────────────────────────────────────────── */}
          <Panel
            label="Goal"
            sub="Set a target and the model works backwards to the intake that reaches it."
          >
            <div className="flex flex-col gap-5">
              <Control
                icon={<Flag size={15} weight="fill" />}
                label="Target weight"
                value={toDisplayMass(goalKg, units).toFixed(1)}
                unit={unit}
                accent="load"
                hint={
                  goalEta === null
                    ? "not reached within two years at these settings"
                    : `about ${horizonPhrase(goalEta)} away`
                }
              >
                <NumberSlider
                value={goalKg}
                onChange={setGoalKg}
                min={Math.max(40, Math.round(b.weightKg - 40))}
                max={Math.round(b.weightKg + 20)}
                step={0.5}
                ariaLabel="Target weight"
              />
              </Control>

              <div className="rounded-md border border-line bg-surface p-4">
                <p className="eyebrow mb-3">To hit it in {horizonPhrase(weeks * 7)}</p>
                {solved.achievable ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[30px] leading-none font-medium text-load">
                        {solved.intakeKcal.toLocaleString()}
                      </span>
                      <span className="font-mono text-[13px] text-ink-faint">kcal/day</span>
                    </div>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
                      {solved.intakeKcal === intake ? (
                        "Exactly what you have set — this trajectory lands on the target."
                      ) : (
                        <>
                          {Math.abs(solved.intakeKcal - intake)} kcal{" "}
                          {solved.intakeKcal > intake ? "more" : "less"} than your current setting,
                          holding steps and training where they are.
                        </>
                      )}
                    </p>
                    {solved.intakeKcal !== intake && (
                      <button
                        onClick={() => setIntake(solved.intakeKcal)}
                        className="mt-3.5 rounded-full bg-load px-3.5 py-2 text-[13px] font-semibold text-on-load transition-opacity hover:opacity-90"
                      >
                        Apply {solved.intakeKcal.toLocaleString()} kcal
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] leading-relaxed text-ink-muted">
                    No sustainable intake reaches {toDisplayMass(goalKg, units).toFixed(1)} {unit} in{" "}
                    {horizonPhrase(weeks * 7)}. Lengthen the horizon, or move more — steps and
                    training raise the ceiling that calories alone cannot.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          {/* ── energy split ─────────────────────────────────────────── */}
          <Panel label="Energy budget" sub="Where today's burn goes, at your current settings.">
            <TdeeSplitChart breakdown={breakdown} intake={intake} />
          </Panel>
        </div>
      </div>

      {/* ── model detail + warnings ───────────────────────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel label="What the model expects" sub="Read these as a central estimate, not a promise.">
          <div className="flex flex-col">
            <Row
              label="Rate over the whole horizon"
              value={`${signed(toDisplayMass(sim.avgRateKgPerWeek, units), 2)} ${unit}/wk`}
              emphasis
            />
            <Row
              label="Rate in the final 4 weeks"
              value={`${signed(toDisplayMass(sim.terminalRateKgPerWeek, units), 2)} ${unit}/wk`}
              accent="recovery"
            />
            <Row
              label="Maintenance today"
              value={`${Math.round(sim.initialTdee).toLocaleString()} kcal`}
            />
            <Row
              label={`Maintenance at ${toDisplayMass(sim.end.weightKg, units).toFixed(1)} ${unit}`}
              value={`${Math.round(sim.finalTdee).toLocaleString()} kcal`}
              accent="energy"
            />
            <Row
              label="Metabolic adaptation"
              value={adaptation ? `${((1 - sim.end.adaptation) * 100).toFixed(1)}% suppressed` : "not modelled"}
            />
            <Row
              label="Lean mass change"
              value={`${signed(toDisplayMass(sim.end.leanMassKg - sim.start.leanMassKg, units), 1)} ${unit}`}
              accent="mass"
            />
            <Row
              label="Fat mass change"
              value={`${signed(toDisplayMass(sim.end.fatMassKg - sim.start.fatMassKg, units), 1)} ${unit}`}
              accent="load"
              emphasis
            />
          </div>

          <p className="mt-4 flex gap-2 text-[12px] leading-relaxed text-ink-faint">
            <Info size={14} className="mt-px shrink-0" />
            <span>
              Maintenance falls by {Math.round(sim.initialTdee - sim.finalTdee)} kcal across this
              projection — partly because a lighter body costs less to run and move, partly because
              of adaptation. That gap is the usual reason a deficit that worked in month one stops
              working in month four.
            </span>
          </p>
        </Panel>

        <Panel label="Flags" sub="Raised by the settings above, not by your recorded data.">
          {sim.warnings.length === 0 ? (
            <div className="flex h-full min-h-[140px] items-center justify-center px-6 text-center">
              <p className="text-[13px] leading-relaxed text-ink-faint">
                Nothing to flag. These settings sit inside the ranges where the model is most
                reliable and the approach is sustainable.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sim.warnings.map((w) => (
                <div
                  key={w.title}
                  className={cn(
                    "rounded-md border-l-2 bg-surface px-3.5 py-3",
                    w.level === "risk"
                      ? "border-l-error"
                      : w.level === "caution"
                        ? "border-l-warning"
                        : "border-l-line-strong",
                  )}
                >
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    {w.level !== "info" && (
                      <Warning
                        size={14}
                        weight="fill"
                        className={w.level === "risk" ? "text-error" : "text-warning"}
                      />
                    )}
                    {w.title}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{w.detail}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ── slider row ─────────────────────────────────────────────────────────── */

/**
 * A slider is never shown without a live readout of its value and unit.
 * A control you cannot read the state of is a guess, not an instrument.
 */
function Control({
  icon,
  label,
  value,
  unit,
  hint,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  accent: AccentName;
  children: React.ReactNode;
}) {
  const tone = {
    load: "text-load",
    recovery: "text-recovery",
    cardiac: "text-cardiac",
    energy: "text-energy",
    mass: "text-mass",
    ink: "text-ink",
  }[accent];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={cn("shrink-0", tone)}>{icon}</span>
          <span className="text-[13px] font-medium text-ink">{label}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <span className={cn("font-mono text-[17px] leading-none font-medium", tone)}>{value}</span>
          {unit && <span className="font-mono text-[11px] text-ink-faint">{unit}</span>}
        </span>
      </div>
      {children}
      {hint && <p className="text-[11px] leading-tight text-ink-faint">{hint}</p>}
    </div>
  );
}
