/**
 * Recovery — sleep, heart rate, and HRV.
 *
 * These three are read together because they move together: a short night
 * shows up as a higher resting heart rate and a lower HRV the next morning.
 * Presenting them on one screen is what makes that pattern visible.
 */

import { useMemo } from "react";
import { Delta, EmptyState, Panel, Row, StatTile } from "@/components/primitives";
import { SleepDurationChart, SleepStagesChart } from "@/components/charts/panels";
import { MetricTrendChart } from "@/components/charts/MetricTrendChart";
import type { Deck } from "@/lib/deck";
import { isTrendMeaningful, project, slopePerMonth } from "@/lib/model/forecast";
import { hoursMinutes, signed } from "@/lib/format";

export function RecoveryView({ deck }: { deck: Deck }) {
  const s = deck.sleepStats;

  const rhrForecast = useMemo(
    () => project(deck.series.restingHr.slice(-120), 60, deck.fits.restingHr),
    [deck.series.restingHr, deck.fits.restingHr],
  );
  const rhrMeaningful = isTrendMeaningful(deck.fits.restingHr, 60);

  const hrvForecast = useMemo(
    () => project(deck.series.hrv.slice(-120), 60, deck.fits.hrv),
    [deck.series.hrv, deck.fits.hrv],
  );
  const hrvMeaningful = isTrendMeaningful(deck.fits.hrv, 60);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Average sleep"
          value={s.total > 0 ? (s.total / 60).toFixed(1) : "—"}
          unit={s.total > 0 ? "h" : undefined}
          accent="recovery"
          delta={
            deck.deltas.sleepHours.hasPrevious && (
              <Delta value={deck.deltas.sleepHours.absolute} window="vs prior 30d" unit=" h" />
            )
          }
          footnote={s.total > 0 ? (s.total / 60 >= 7 ? "inside the 7–9h target" : "below the 7h floor") : undefined}
        />
        <StatTile
          label="Deep + REM"
          value={s.restorativePct > 0 ? s.restorativePct.toFixed(0) : "—"}
          unit="%"
          accent="recovery"
          footnote={`${hoursMinutes(s.deep)} deep · ${hoursMinutes(s.rem)} REM`}
        />
        <StatTile
          label="Night-to-night swing"
          value={s.consistencyMin > 0 ? `±${Math.round(s.consistencyMin)}` : "—"}
          unit="min"
          accent="mass"
          footnote={
            s.consistencyMin > 60
              ? "irregular — regularity predicts outcomes on its own"
              : "consistent enough for a stable circadian schedule"
          }
        />
        <StatTile
          label="Overnight HRV"
          value={deck.current.hrv ? Math.round(deck.current.hrv).toString() : "—"}
          unit={deck.current.hrv ? "ms" : undefined}
          accent="load"
          delta={
            deck.deltas.hrv.hasPrevious && (
              <Delta value={deck.deltas.hrv.absolute} window="vs prior 30d" unit=" ms" />
            )
          }
        />
      </div>

      <Panel
        label="Sleep architecture"
        sub="Stacked hours by stage. Deep and REM sit at the base so their thickness reads against a flat line."
      >
        {deck.sleep.length > 3 ? (
          <SleepStagesChart sleep={deck.sleep.slice(-120)} height={260} />
        ) : (
          <EmptyState
            title="No sleep records"
            detail="Sleep staging was not found in this dataset. Garmin exports it in the wellness JSON bundle rather than in Activities.csv."
          />
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          label="Resting heart rate"
          sub={
            rhrMeaningful
              ? `Trending ${signed(slopePerMonth(deck.fits.restingHr), 1)} bpm per month, projected 60 days out. Lower is better.`
              : "Stable within noise, so no projection is drawn."
          }
        >
          {deck.series.restingHr.length > 6 ? (
            <MetricTrendChart
              points={rhrForecast}
              color="#ff6b6b"
              unit="bpm"
              dp={0}
              showProjection={rhrMeaningful}
              seamDate={deck.series.restingHr.at(-1)?.date}
              invertBetter
            />
          ) : (
            <EmptyState title="No resting HR data" detail="Resting heart rate was not found in this dataset." />
          )}
        </Panel>

        <Panel
          label="Heart rate variability"
          sub={
            hrvMeaningful
              ? `Trending ${signed(slopePerMonth(deck.fits.hrv), 1)} ms per month. Higher generally means better-recovered.`
              : "Stable within noise, so no projection is drawn."
          }
        >
          {deck.series.hrv.length > 6 ? (
            <MetricTrendChart
              points={hrvForecast}
              color="#b8f23c"
              unit="ms"
              dp={0}
              showProjection={hrvMeaningful}
              seamDate={deck.series.hrv.at(-1)?.date}
            />
          ) : (
            <EmptyState title="No HRV data" detail="Overnight HRV was not found in this dataset." />
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel label="Nightly duration" sub="The shaded band marks 7–9 hours.">
          {deck.sleep.length > 3 ? (
            <SleepDurationChart sleep={deck.sleep.slice(-90)} height={220} />
          ) : (
            <EmptyState title="No sleep records" detail="Nothing to chart in this range." />
          )}
        </Panel>

        <Panel label="Average night" sub="Mean minutes per stage across the selected range.">
          {s.total > 0 ? (
            <div className="flex flex-col">
              <Row label="Total" value={hoursMinutes(s.total)} emphasis />
              <Row label="Deep" value={hoursMinutes(s.deep)} accent="recovery" />
              <Row label="REM" value={hoursMinutes(s.rem)} accent="recovery" />
              <Row label="Light" value={hoursMinutes(s.light)} />
              <Row label="Awake" value={hoursMinutes(s.awake)} accent="cardiac" />
              <Row
                label="Restorative share"
                value={`${s.restorativePct.toFixed(0)}%`}
                accent="load"
                emphasis
              />
            </div>
          ) : (
            <EmptyState title="No sleep records" detail="Nothing to summarise in this range." />
          )}
        </Panel>
      </div>
    </div>
  );
}
