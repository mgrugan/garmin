/**
 * Overview — the answer to "how am I doing" in one screen.
 *
 * The tile strip is the thesis: six readouts, each bound to its domain colour,
 * each carrying a sparkline and a delta that names its own comparison window.
 * Everything below it exists to explain one of those six numbers.
 */

import { useMemo } from "react";
import { Panel, StatTile, Delta, EmptyState, Row } from "@/components/primitives";
import { Sparkline } from "@/components/charts/MetricTrendChart";
import { LoadChart, SleepDurationChart, StepsChart } from "@/components/charts/panels";
import { TrajectoryChart } from "@/components/charts/TrajectoryChart";
import type { Deck } from "@/lib/deck";
import type { GarminDataset } from "@/lib/garmin/types";
import { ACCENT_HEX } from "@/components/primitives";
import { loadVerdict, mean } from "@/lib/garmin/derive";
import { simulate } from "@/lib/model/weight";
import {
  compactNumber,
  hoursMinutes,
  kgUnit,
  km,
  kmUnit,
  toDisplayMass,
  type UnitSystem,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function OverviewView({
  deck,
  dataset,
  units,
}: {
  deck: Deck;
  dataset: GarminDataset;
  units: UnitSystem;
}) {
  const c = deck.current;
  const unit = kgUnit(units);
  const verdict = loadVerdict(c.loadRatio);

  // A 12-week look-ahead at the habits already in the data — no user input.
  // This is the "if nothing changes" line, which is the honest default.
  const projection = useMemo(
    () =>
      simulate({
        profile: dataset.profile,
        startWeightKg: deck.baseline.weightKg,
        startBodyFatPct: deck.baseline.bodyFatPct,
        hasBodyComp: deck.baseline.hasBodyComp,
        intakeKcal: 2200,
        steps: deck.baseline.avgSteps,
        exerciseKcalPerDay: deck.baseline.exerciseKcalPerDay,
        proteinGPerKg: 1.6,
        strengthSessionsPerWeek: deck.baseline.strengthSessionsPerWeek,
        days: 84,
        modelAdaptation: true,
      }),
    [dataset.profile, deck.baseline],
  );

  const stepRows = useMemo(
    () => deck.days.filter((d) => d.steps).map((d) => ({ date: d.date, steps: d.steps! })),
    [deck.days],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── the strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Body mass"
          value={c.weightKg ? toDisplayMass(c.weightKg, units).toFixed(1) : "—"}
          unit={c.weightKg ? unit : undefined}
          accent="mass"
          delta={
            deck.deltas.weight.hasPrevious && (
              <Delta
                value={toDisplayMass(deck.deltas.weight.absolute, units)}
                window="vs prior 30d"
                unit={` ${unit}`}
                invert
                dp={1}
              />
            )
          }
        >
          <Sparkline
            values={deck.series.weight.slice(-60).map((p) => p.value)}
            color={ACCENT_HEX.mass}
          />
        </StatTile>

        <StatTile
          label="Resting HR"
          value={c.restingHr ? Math.round(c.restingHr).toString() : "—"}
          unit={c.restingHr ? "bpm" : undefined}
          accent="cardiac"
          delta={
            deck.deltas.restingHr.hasPrevious && (
              <Delta
                value={deck.deltas.restingHr.absolute}
                window="vs prior 30d"
                unit=" bpm"
                invert
              />
            )
          }
        >
          <Sparkline
            values={deck.series.restingHr.slice(-60).map((p) => p.value)}
            color={ACCENT_HEX.cardiac}
          />
        </StatTile>

        <StatTile
          label="VO₂max"
          value={c.vo2max ? c.vo2max.toFixed(1) : "—"}
          accent="load"
          footnote={
            c.vo2max
              ? fitnessAge(c.vo2max, dataset.profile.age, dataset.profile.sex)
              : undefined
          }
        >
          <Sparkline
            values={deck.series.vo2max.slice(-40).map((p) => p.value)}
            color={ACCENT_HEX.load}
          />
        </StatTile>

        <StatTile
          label="Sleep"
          value={
            deck.sleepStats.total > 0 ? (deck.sleepStats.total / 60).toFixed(1) : "—"
          }
          unit={deck.sleepStats.total > 0 ? "h avg" : undefined}
          accent="recovery"
          delta={
            deck.deltas.sleepHours.hasPrevious && (
              <Delta value={deck.deltas.sleepHours.absolute} window="vs prior 30d" unit=" h" />
            )
          }
        >
          <Sparkline
            values={deck.series.sleepHours.slice(-60).map((p) => p.value)}
            color={ACCENT_HEX.recovery}
          />
        </StatTile>

        <StatTile
          label="Steps"
          value={
            deck.days.length ? compactNumber(mean(deck.days.map((d) => d.steps ?? 0))) : "—"
          }
          unit="avg/day"
          accent="recovery"
          delta={
            deck.deltas.steps.hasPrevious && (
              <Delta value={deck.deltas.steps.absolute} window="vs prior 30d" dp={0} />
            )
          }
        >
          <Sparkline
            values={deck.series.steps.slice(-60).map((p) => p.value)}
            color={ACCENT_HEX.recovery}
          />
        </StatTile>

        <StatTile
          label="Training load"
          value={c.loadRatio > 0 ? c.loadRatio.toFixed(2) : "—"}
          unit="ratio"
          accent="load"
          footnote={verdict.label}
        >
          <div className="flex h-7 items-end gap-px">
            {deck.load.slice(-40).map((p, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-[1px]",
                  p.load > 0 ? "bg-load/70" : "bg-line-strong/50",
                )}
                style={{
                  height: `${Math.max(6, Math.min(100, (p.load / Math.max(1, Math.max(...deck.load.slice(-40).map((x) => x.load)))) * 100))}%`,
                }}
              />
            ))}
          </div>
        </StatTile>
      </div>

      {/* ── projection + summary ──────────────────────────────────────── */}
      {/* items-start stops the chart panel stretching to match the two stacked
          panels beside it, which left a band of dead space under the legend. */}
      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          label="Where this is heading"
          sub="Twelve weeks projected from the habits already in your data, at 2,200 kcal a day."
        >
          {deck.series.weight.length > 5 ? (
            <TrajectoryChart
              history={dataset.weight.slice(-180)}
              simulation={projection.points}
              units={units}
              height={300}
            />
          ) : (
            <EmptyState
              title="Not enough weigh-ins yet"
              detail="The projection needs a handful of scale readings to establish a trend. Import a Garmin export with weight data, or weigh in a few more times."
            />
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel label="Period summary" sub="Everything recorded in the selected range.">
            <div className="flex flex-col">
              <Row label="Sessions" value={String(deck.totals.sessions)} emphasis />
              <Row label="Training time" value={hoursMinutes(deck.totals.hours * 60)} accent="load" />
              <Row
                label="Distance"
                value={`${km(deck.totals.distanceKm, units, 1)} ${kmUnit(units)}`}
                accent="recovery"
              />
              <Row
                label="Activity calories"
                value={`${compactNumber(deck.totals.calories)} kcal`}
                accent="energy"
              />
              <Row
                label="Deep + REM share"
                value={`${deck.sleepStats.restorativePct.toFixed(0)}%`}
                accent="recovery"
              />
              <Row
                label="Maintenance estimate"
                value={`${Math.round(deck.baseline.maintenanceKcal).toLocaleString()} kcal`}
                accent="energy"
                emphasis
              />
            </div>
          </Panel>

          <Panel label="Projected in 12 weeks" sub="Holding current habits and 2,200 kcal.">
            <div className="flex flex-col">
              <Row
                label="Body mass"
                value={`${toDisplayMass(projection.end.weightKg, units).toFixed(1)} ${unit}`}
                accent="mass"
                emphasis
              />
              <Row
                label="Change"
                value={`${projection.totalChangeKg > 0 ? "+" : "−"}${Math.abs(toDisplayMass(projection.totalChangeKg, units)).toFixed(1)} ${unit}`}
                accent={projection.totalChangeKg < 0 ? "load" : "energy"}
              />
              <Row
                label="Body fat"
                value={`${projection.end.bodyFatPct.toFixed(1)}%`}
                accent="mass"
              />
              <Row
                label="Weekly rate"
                value={`${projection.avgRateKgPerWeek > 0 ? "+" : "−"}${Math.abs(toDisplayMass(projection.avgRateKgPerWeek, units)).toFixed(2)} ${unit}`}
              />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
              Open the Trajectory tab to change intake, steps, and training and watch this move.
            </p>
          </Panel>
        </div>
      </div>

      {/* ── supporting charts ─────────────────────────────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel label="Fitness against fatigue" sub="42-day load carries fitness; 7-day load carries fatigue.">
          {deck.load.length > 14 ? (
            <LoadChart data={deck.load} />
          ) : (
            <EmptyState title="Not enough activity yet" detail="Training load needs a few weeks of sessions before fitness and fatigue separate." />
          )}
        </Panel>

        <Panel label="Sleep duration" sub="The shaded band marks the 7–9 hour target.">
          {deck.sleep.length > 3 ? (
            <SleepDurationChart sleep={deck.sleep.slice(-90)} />
          ) : (
            <EmptyState title="No sleep records" detail="Sleep tracking data was not found in this dataset." />
          )}
        </Panel>
      </div>

      <Panel label="Daily steps" sub="Bars reach full colour above 8,000 — the point where the effect on expenditure becomes material.">
        {stepRows.length > 3 ? (
          <StepsChart data={stepRows.slice(-120)} />
        ) : (
          <EmptyState title="No step data" detail="Daily step counts were not found in this dataset." />
        )}
      </Panel>
    </div>
  );
}

/**
 * VO₂max expressed as the age at which this value is average, from the
 * population regressions in Jackson et al. — men decline about 0.37 ml/kg/min
 * a year from ~57.8, women about 0.34 from ~46.0.
 *
 * Clamped to 18–80 because the regression is linear and runs off into
 * nonsense at both ends: a well-trained 34-year-old would otherwise be told
 * they have the VO₂max of a nine-year-old.
 */
function fitnessAge(vo2: number, age: number, sex: "male" | "female"): string {
  const [intercept, slope] = sex === "male" ? [57.8, 0.372] : [46.0, 0.343];
  const estimated = Math.round((intercept - vo2) / slope);

  if (estimated < 18) return "top of the population range";
  if (estimated > 80) return "below the typical adult range";

  const clamped = Math.min(80, Math.max(18, estimated));
  if (Math.abs(clamped - age) < 2) return "typical for your age";
  return `equivalent to age ${clamped}`;
}
