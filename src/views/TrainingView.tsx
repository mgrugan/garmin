/**
 * Training — volume, intensity distribution, and load balance.
 *
 * The question this view answers is not "how much did I do" but "was it the
 * right shape". Hence the zone chart and the acute:chronic ratio sit above the
 * volume bars: distribution and balance decide whether volume produces
 * adaptation or just fatigue.
 */

import { useMemo } from "react";
import { CoverageNotice, Panel, StatTile, EmptyState } from "@/components/primitives";
import {
  LoadChart,
  RatioChart,
  WeeklyVolumeChart,
  ZoneChart,
} from "@/components/charts/panels";
import { MetricTrendChart } from "@/components/charts/MetricTrendChart";
import type { Deck } from "@/lib/deck";
import { ACTIVITY_LABELS } from "@/lib/garmin/types";
import { loadVerdict, mean } from "@/lib/garmin/derive";
import { isTrendMeaningful, project, slopePerMonth } from "@/lib/model/forecast";
import { compactNumber, hoursMinutes, km, kmUnit, pace, type UnitSystem } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TrainingView({ deck, units }: { deck: Deck; units: UnitSystem }) {
  const verdict = loadVerdict(deck.current.loadRatio);
  // Fitness is a 42-day exponential average. Below ~28 days it is mostly the
  // seed value, so the ratio it produces says nothing about the athlete.
  const loadReady = deck.spanDays >= 28;

  const vo2Forecast = useMemo(
    () => project(deck.series.vo2max.slice(-40), 90, deck.fits.vo2max),
    [deck.series.vo2max, deck.fits.vo2max],
  );
  const vo2Meaningful = isTrendMeaningful(deck.fits.vo2max, 90);

  const zoneTotal = deck.zones.reduce((a, b) => a + b, 0);
  const easyShare = zoneTotal > 0 ? ((deck.zones[0] + deck.zones[1]) / zoneTotal) * 100 : 0;

  const weeklyHours = deck.weeks.length
    ? mean(deck.weeks.map((w) => w.durationMin / 60))
    : 0;

  const runs = deck.activities.filter((a) => a.type === "run" && a.paceMinPerKm);
  const avgPace = runs.length ? mean(runs.map((a) => a.paceMinPerKm!)) : 0;

  if (!deck.activities.length) {
    return (
      <Panel label="Training" sub="No sessions in the selected range.">
        <EmptyState
          title="No activities found"
          detail="Import a Garmin Connect export containing Activities.csv, or widen the date range."
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CoverageNotice spanDays={deck.spanDays} needDays={28} what="Training load" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Weekly volume"
          value={weeklyHours.toFixed(1)}
          unit="h avg"
          accent="load"
          footnote={`${deck.totals.sessions} sessions across ${deck.weeks.length} weeks`}
        />
        <StatTile
          label="Load balance"
          value={loadReady ? deck.current.loadRatio.toFixed(2) : "—"}
          unit={loadReady ? "acute:chronic" : undefined}
          accent={
            !loadReady ? "ink" : verdict.tone === "good" ? "load" : verdict.tone === "risk" ? "cardiac" : "energy"
          }
          footnote={
            loadReady
              ? `${verdict.label} — 0.80 to 1.30 is the productive band`
              : "needs ~28 days; the 42-day baseline has not formed yet"
          }
        />
        <StatTile
          label="Easy share"
          value={easyShare.toFixed(0)}
          unit="%"
          accent="recovery"
          footnote={
            easyShare >= 75
              ? "polarised, as intended"
              : "polarised programmes run near 80% easy"
          }
        />
        <StatTile
          label={runs.length ? "Average run pace" : "Distance"}
          value={
            runs.length
              ? pace(avgPace, units)
              : km(deck.totals.distanceKm, units, 0)
          }
          unit={runs.length ? `/${kmUnit(units)}` : kmUnit(units)}
          accent="cardiac"
          footnote={runs.length ? `across ${runs.length} run${runs.length === 1 ? "" : "s"}` : undefined}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel
          label="Fitness against fatigue"
          sub="Fitness is a 42-day exponential average of load; fatigue is the 7-day. The gap between them is freshness."
        >
          {loadReady ? (
            <LoadChart data={deck.load} height={260} />
          ) : (
            <EmptyState
              title="Not enough history for a load baseline"
              detail={`Fitness is a 42-day average and your export covers ${deck.spanDays} days. Drawing it now would mostly plot the model's starting assumption rather than your training.`}
            />
          )}
        </Panel>

        <Panel
          label="Intensity distribution"
          sub="Time in each heart-rate zone, from average HR per session."
        >
          {zoneTotal > 0 ? (
            <>
              <ZoneChart minutes={deck.zones} />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
                {easyShare < 65
                  ? "Most of this sits in the middle — hard enough to cost recovery, easy enough that adaptation lags. Slowing the easy sessions is usually free fitness."
                  : "A healthy polarised split: most time easy, with the hard work genuinely hard."}
              </p>
            </>
          ) : (
            <EmptyState
              title="No heart-rate data"
              detail="Zone distribution needs average heart rate on your activities."
            />
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          label="Acute : chronic ratio"
          sub="The shaded band is 0.80–1.30, where fitness builds without the injury-risk penalty."
        >
          {loadReady ? (
            <RatioChart data={deck.load} />
          ) : (
            <EmptyState
              title="Ratio needs a settled baseline"
              detail="The acute:chronic ratio compares a 7-day load against a 42-day one. Until the longer window fills, the number is an artefact of where the average started."
            />
          )}
        </Panel>

        <Panel
          label="VO₂max"
          sub={
            vo2Meaningful
              ? `Trending ${slopePerMonth(deck.fits.vo2max) >= 0 ? "+" : ""}${slopePerMonth(deck.fits.vo2max).toFixed(2)} per month, projected 90 days out.`
              : "Flat within measurement noise, so no projection is drawn."
          }
        >
          {deck.series.vo2max.length > 4 ? (
            <MetricTrendChart
              points={vo2Forecast}
              color="#b8f23c"
              unit="ml/kg/min"
              dp={1}
              showProjection={vo2Meaningful}
              seamDate={deck.series.vo2max.at(-1)?.date}
            />
          ) : (
            <EmptyState
              title="Not enough VO₂max readings"
              detail="Garmin only updates VO₂max after qualifying outdoor runs or rides."
            />
          )}
        </Panel>
      </div>

      <Panel
        label="Weekly volume"
        sub="Hours per week. Bars reach full colour when the week is at or above the period average."
      >
        <WeeklyVolumeChart weeks={deck.weeks} units={units} />
      </Panel>

      <Panel label="By discipline" sub="Where the training time actually went.">
        <div className="flex flex-col">
          {deck.totals.byType.map((t) => {
            const share = deck.totals.hours > 0 ? (t.minutes / 60 / deck.totals.hours) * 100 : 0;
            return (
              <div key={t.type} className="border-b border-line/60 py-2.5 last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="text-[13px] font-medium text-ink">
                      {ACTIVITY_LABELS[t.type]}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-faint">
                      {t.sessions} session{t.sessions === 1 ? "" : "s"}
                      {t.distanceKm > 0 && ` · ${km(t.distanceKm, units, 0)} ${kmUnit(units)}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] text-ink-muted">
                    {hoursMinutes(t.minutes)}
                    <span className="ml-2 text-ink-faint">{share.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                  <div className={cn("h-full rounded-full bg-load")} style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel label="Recent sessions" sub="Newest first.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {["Date", "Session", "Duration", "Distance", "Avg HR", "kcal"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn("eyebrow py-2 font-medium", i === 0 || i === 1 ? "text-left" : "text-right")}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...deck.activities]
                .reverse()
                .slice(0, 20)
                .map((a, i) => (
                  <tr key={`${a.date}-${i}`} className="border-b border-line/50 last:border-0">
                    <td className="py-2 font-mono text-[12px] text-ink-faint">
                      {new Date(`${a.date}T00:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-2 pr-3 text-[13px] text-ink">
                      {a.title ?? ACTIVITY_LABELS[a.type]}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] text-ink-muted">
                      {hoursMinutes(a.durationMin)}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] text-ink-muted">
                      {a.distanceKm ? `${km(a.distanceKm, units, 1)}` : "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] text-ink-muted">
                      {a.avgHr ? Math.round(a.avgHr) : "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] text-ink-muted">
                      {a.calories ? compactNumber(a.calories) : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
