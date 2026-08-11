/**
 * Rule-based coaching layer.
 *
 * Every insight must clear three bars before it is shown:
 *
 *  1. **Evidence** — it names the number that triggered it, so the user can
 *     check the claim against the chart above it.
 *  2. **Action** — it says what to change, not just what is wrong. "Your sleep
 *     is short" is an observation; a dashboard should hand over a decision.
 *  3. **Honesty about magnitude** — where an effect size is quoted it comes
 *     from published intervention research, and where one can't be quoted the
 *     insight says so rather than inventing a number.
 *
 * Insights are scored and sorted, and only the top handful surface. A list of
 * twenty recommendations is a list of zero recommendations.
 */

import {
  completeDays,
  loadVerdict,
  mean,
  periodDelta,
  seriesFrom,
  sleepBreakdown,
  type LoadPoint,
  zoneMinutes,
} from "../garmin/derive";
import { fitTrend, isTrendMeaningful, slopePerMonth, type Series } from "./forecast";
import type { ActivityRecord, DayRecord, GarminDataset, SleepRecord } from "../garmin/types";

export type InsightCategory = "training" | "recovery" | "body" | "consistency";

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  /** What in the data triggered this, in the user's own numbers. */
  evidence: string;
  /** What to do about it. */
  action: string;
  /** Expected effect, or an explicit statement that it isn't quantifiable. */
  effect: string;
  /** 0–100. Drives ordering and the strength of the visual treatment. */
  priority: number;
  tone: "good" | "warn" | "risk";
}

export interface InsightContext {
  dataset: GarminDataset;
  days: DayRecord[];
  sleep: SleepRecord[];
  activities: ActivityRecord[];
  load: LoadPoint[];
  maxHr: number;
}

export function buildInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { days, sleep, activities, load, maxHr } = ctx;

  out.push(...sleepInsights(sleep));
  out.push(...loadInsights(load, activities, maxHr));
  out.push(...cardiacInsights(ctx.dataset, days, sleep));
  out.push(...consistencyInsights(days, activities));
  out.push(...bodyInsights(ctx.dataset));

  return out.sort((a, b) => b.priority - a.priority);
}

/* ── sleep ──────────────────────────────────────────────────────────────── */

function sleepInsights(sleep: SleepRecord[]): Insight[] {
  if (sleep.length < 14) return [];
  const out: Insight[] = [];
  const recent = sleep.slice(-28);
  const b = sleepBreakdown(recent);
  const hours = b.total / 60;

  if (hours < 7) {
    const shortfall = (7 * 60 - b.total) / 60;
    out.push({
      id: "sleep-duration",
      category: "recovery",
      title: `Averaging ${hours.toFixed(1)}h of sleep`,
      evidence: `Over the last ${recent.length} nights you slept ${hours.toFixed(1)}h on average — ${shortfall.toFixed(1)}h under the 7h floor where recovery markers start to degrade.`,
      action: `Move lights-out ${Math.round(shortfall * 60)} minutes earlier. Wake time is usually fixed by work, so bedtime is the only lever that reliably moves.`,
      effect:
        "Restoring an hour typically lifts next-day HRV and drops resting heart rate by 1–3 bpm within two weeks. It is the highest-leverage single change available here.",
      priority: hours < 6.25 ? 96 : 84,
      tone: hours < 6.25 ? "risk" : "warn",
    });
  }

  // Irregularity independently predicts poor outcomes, even at adequate duration.
  if (b.consistencyMin > 60) {
    out.push({
      id: "sleep-consistency",
      category: "recovery",
      title: "Sleep length swings night to night",
      evidence: `Your nightly duration varies by ±${Math.round(b.consistencyMin)} minutes. Anything past an hour means the body never settles on a circadian schedule.`,
      action:
        "Anchor wake time within a 30-minute window every day, weekends included. Consistency of the wake anchor matters more than consistency of bedtime.",
      effect:
        "Regularity predicts health outcomes independently of total sleep — evening it out is worth doing even if the average never changes.",
      priority: 72,
      tone: "warn",
    });
  }

  if (b.restorativePct > 0 && b.restorativePct < 30 && hours >= 6.5) {
    out.push({
      id: "sleep-quality",
      category: "recovery",
      title: `Only ${b.restorativePct.toFixed(0)}% of sleep is deep or REM`,
      evidence: `You are getting enough hours, but ${Math.round(b.deep)} min deep and ${Math.round(b.rem)} min REM leaves the restorative share below the typical 30–45% band.`,
      action:
        "Alcohol and late hard sessions are the two most common suppressors of deep sleep. Try moving intense training before 6pm for a fortnight and compare.",
      effect:
        "Deep-sleep share responds within days to both changes, so a two-week test is enough to see whether it is the cause here.",
      priority: 58,
      tone: "warn",
    });
  }

  if (hours >= 7.5 && b.consistencyMin <= 45) {
    out.push({
      id: "sleep-good",
      category: "recovery",
      title: "Sleep is doing its job",
      evidence: `${hours.toFixed(1)}h average with only ±${Math.round(b.consistencyMin)} min of night-to-night variation.`,
      action: "Nothing to fix. This is the foundation the rest of the plan sits on — protect it when training ramps.",
      effect: "Maintaining this is worth more than any change you could make to the training itself.",
      priority: 22,
      tone: "good",
    });
  }

  return out;
}

/* ── training load ──────────────────────────────────────────────────────── */

function loadInsights(load: LoadPoint[], activities: ActivityRecord[], maxHr: number): Insight[] {
  if (load.length < 28) return [];
  const out: Insight[] = [];
  const last = load[load.length - 1];
  const verdict = loadVerdict(last.ratio);

  if (last.ratio > 1.5) {
    out.push({
      id: "load-spike",
      category: "training",
      title: "Training load has spiked",
      evidence: `Your 7-day load is ${last.ratio.toFixed(2)}× your 42-day baseline. Above 1.5 is where injury rates climb sharply in the literature.`,
      action:
        "Hold volume flat for 7–10 days rather than cutting it — an abrupt drop costs fitness. Let the chronic line catch up to the acute one.",
      effect: "Bringing the ratio back inside 0.8–1.3 is the single best-evidenced way to reduce soft-tissue injury risk.",
      priority: 92,
      tone: "risk",
    });
  } else if (last.ratio < 0.8 && last.chronic > 5) {
    out.push({
      id: "load-detrain",
      category: "training",
      title: "Load has dropped below maintenance",
      evidence: `7-day load is only ${last.ratio.toFixed(2)}× the 42-day baseline, so accumulated fitness is decaying faster than it is being replaced.`,
      action: `Add roughly ${Math.round((0.95 - last.ratio) * last.chronic * 7)} load-units back across the week — one easy session usually covers it.`,
      effect: "Aerobic adaptations decay noticeably after about two weeks of reduced stimulus; catching it early avoids rebuilding from scratch.",
      priority: 66,
      tone: "warn",
    });
  } else if (verdict.tone === "good") {
    out.push({
      id: "load-good",
      category: "training",
      title: "Load is in the productive band",
      evidence: `Acute:chronic ratio of ${last.ratio.toFixed(2)} sits inside the 0.8–1.3 window where fitness builds without the injury-risk penalty.`,
      action: "Keep the ramp gradual — under 10% week to week — and this stays true as volume grows.",
      effect: "No change needed.",
      priority: 24,
      tone: "good",
    });
  }

  // Intensity distribution: the classic amateur failure mode is too much
  // moderate work — hard enough to cost recovery, easy enough not to adapt.
  const zones = zoneMinutes(activities, maxHr);
  const total = zones.reduce((a, b) => a + b, 0);
  if (total > 240) {
    const easyPct = ((zones[0] + zones[1]) / total) * 100;
    const greyPct = (zones[2] / total) * 100;

    if (easyPct < 65 && greyPct > 25) {
      out.push({
        id: "grey-zone",
        category: "training",
        title: "Too much time in the grey zone",
        evidence: `${greyPct.toFixed(0)}% of your training sits in Z3, and only ${easyPct.toFixed(0)}% is genuinely easy. Polarised programmes run about 80% easy.`,
        action:
          "Slow your easy sessions until you can hold a conversation, and let the hard ones get genuinely hard. The middle is where effort is spent without adaptation.",
        effect:
          "Redistributing intensity without adding a single minute typically improves aerobic markers within 6–8 weeks — it is free fitness.",
        priority: 79,
        tone: "warn",
      });
    }
  }

  return out;
}

/* ── cardiac markers ────────────────────────────────────────────────────── */

function cardiacInsights(dataset: GarminDataset, days: DayRecord[], sleep: SleepRecord[]): Insight[] {
  const out: Insight[] = [];

  const rhr = seriesFrom(days, (d) => d.restingHeartRate);
  const rhrFit = fitTrend(rhr.slice(-90));
  if (isTrendMeaningful(rhrFit, 90)) {
    const perMonth = slopePerMonth(rhrFit);
    if (perMonth > 0.6) {
      out.push({
        id: "rhr-rising",
        category: "recovery",
        title: `Resting heart rate is drifting up ${perMonth.toFixed(1)} bpm/month`,
        evidence: `Over the last 90 days the robust trend in resting HR is +${perMonth.toFixed(1)} bpm per month. A rising baseline usually means accumulated fatigue, illness, poor sleep, or stress rather than lost fitness.`,
        action:
          "Cross-check against the load and sleep panels. If load is high, take a genuine down week; if sleep is short, fix that first.",
        effect: "Resting HR responds within 7–10 days once the underlying stressor is removed, which makes it a fast feedback signal.",
        priority: 81,
        tone: "warn",
      });
    } else if (perMonth < -0.4) {
      out.push({
        id: "rhr-falling",
        category: "recovery",
        title: `Resting heart rate is falling ${Math.abs(perMonth).toFixed(1)} bpm/month`,
        evidence: `The 90-day trend is ${perMonth.toFixed(1)} bpm per month — the clearest single sign that aerobic adaptation is happening.`,
        action: "Whatever the current balance of volume and recovery is, it is working. Change one variable at a time from here.",
        effect: "Sustained, this is the marker most strongly associated with improving cardiovascular fitness.",
        priority: 30,
        tone: "good",
      });
    }
  }

  const hrv = seriesFrom(dataset.hrv, (h) => h.avgMs);
  if (hrv.length > 30) {
    const d = periodDelta(hrv, 14);
    if (d.hasPrevious && d.percent < -8) {
      out.push({
        id: "hrv-drop",
        category: "recovery",
        title: `HRV is down ${Math.abs(d.percent).toFixed(0)}% over two weeks`,
        evidence: `Overnight HRV averaged ${d.current.toFixed(0)} ms across the last 14 nights, against ${d.previous.toFixed(0)} ms in the 14 before.`,
        action:
          "A drop this size is worth treating as a real signal. Pull intensity back for 5–7 days and watch whether it recovers before adding load again.",
        effect: "HRV is noisy night to night but reliable across two-week windows, which is why this compares blocks rather than days.",
        priority: 76,
        tone: "warn",
      });
    }
  }

  const scores = seriesFrom(sleep, (s) => s.score);
  if (scores.length > 30) {
    const d = periodDelta(scores, 14);
    if (d.hasPrevious && d.absolute < -6) {
      out.push({
        id: "sleep-score-drop",
        category: "recovery",
        title: "Sleep score is trending down",
        evidence: `Two-week average fell from ${d.previous.toFixed(0)} to ${d.current.toFixed(0)}.`,
        action: "Check whether it tracks the load chart. If it does, this is training stress; if it doesn't, look outside training.",
        effect: "Not independently quantifiable — treat it as a prompt to look, not a conclusion.",
        priority: 54,
        tone: "warn",
      });
    }
  }

  return out;
}

/* ── consistency ────────────────────────────────────────────────────────── */

function consistencyInsights(days: DayRecord[], activities: ActivityRecord[]): Insight[] {
  const out: Insight[] = [];
  if (days.length < 28) return out;

  const recent = completeDays(days).slice(-28);
  const avgSteps = mean(recent.map((d) => d.steps ?? 0).filter((s) => s > 0));

  if (avgSteps > 0 && avgSteps < 7500) {
    const gap = 8000 - avgSteps;
    out.push({
      id: "steps-low",
      category: "body",
      title: `Averaging ${Math.round(avgSteps).toLocaleString()} steps a day`,
      evidence: `Daily movement outside workouts is the largest and most controllable part of expenditure. You are ${Math.round(gap).toLocaleString()} short of 8,000.`,
      action: "Two 15-minute walks cover most of the gap and cost nothing in recovery, unlike adding a session.",
      effect: `Roughly ${Math.round((gap / 1389) * 0.53 * 84)} kcal/day at your body mass — about ${(((gap / 1389) * 0.53 * 84 * 30) / 7700).toFixed(1)} kg over a month, all else equal.`,
      priority: 74,
      tone: "warn",
    });
  }

  // Long gaps hurt more than low averages — adaptation needs frequency.
  const byWeek = new Map<string, number>();
  for (const a of activities) {
    const wk = a.date.slice(0, 7) + "-" + Math.floor(Number(a.date.slice(8, 10)) / 7);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }
  const sessionsPerWeek = activities.length / Math.max(1, days.length / 7);

  if (sessionsPerWeek > 0 && sessionsPerWeek < 2.5) {
    out.push({
      id: "frequency-low",
      category: "consistency",
      title: `${sessionsPerWeek.toFixed(1)} sessions a week`,
      evidence: "Below about three sessions a week, aerobic adaptations accumulate slowly because the stimulus decays between them.",
      action: "A third short session does more than lengthening the two you already do. Frequency beats duration at this end of the range.",
      effect: "Moving from 2 to 3 weekly sessions is the largest step change in the whole frequency curve.",
      priority: 70,
      tone: "warn",
    });
  }

  return out;
}

/* ── body composition ───────────────────────────────────────────────────── */

function bodyInsights(dataset: GarminDataset): Insight[] {
  const out: Insight[] = [];
  const w: Series[] = seriesFrom(dataset.weight, (r) => r.weightKg);
  if (w.length < 21) return out;

  const recentFit = fitTrend(w.slice(-42));
  const priorFit = fitTrend(w.slice(-84, -42));

  if (recentFit && priorFit) {
    const recentPerWeek = recentFit.slope * 7;
    const priorPerWeek = priorFit.slope * 7;

    // A plateau is specifically: was losing, now isn't.
    if (priorPerWeek < -0.15 && recentPerWeek > -0.05) {
      out.push({
        id: "weight-plateau",
        category: "body",
        title: "Weight loss has plateaued",
        evidence: `You were losing ${Math.abs(priorPerWeek).toFixed(2)} kg/week six weeks ago; the current trend is ${Math.abs(recentPerWeek).toFixed(2)} kg/week.`,
        action:
          "A plateau at constant intake is usually adaptation plus a lighter body costing less to run, not a stalled metabolism. Use the Trajectory panel to re-solve intake for your current weight rather than the weight you started at.",
        effect: "Recalculating typically finds a 100–200 kcal gap that has quietly opened as you lost mass.",
        priority: 86,
        tone: "warn",
      });
    } else if (recentPerWeek < -0.15) {
      out.push({
        id: "weight-trending",
        category: "body",
        title: `Losing ${Math.abs(recentPerWeek).toFixed(2)} kg per week`,
        evidence: `The robust 6-week trend is ${recentPerWeek.toFixed(2)} kg/week, which is ${((Math.abs(recentPerWeek) / w[w.length - 1].value) * 100).toFixed(2)}% of body weight.`,
        action:
          Math.abs(recentPerWeek) / w[w.length - 1].value > 0.01
            ? "This is above 1% of body weight per week — easing the deficit will protect more lean mass for a similar fat loss."
            : "This is a sustainable rate. Hold it and re-check the projection monthly.",
        effect: "Rates under 1% of body weight per week preserve meaningfully more lean tissue at the same total loss.",
        priority: Math.abs(recentPerWeek) / w[w.length - 1].value > 0.01 ? 78 : 26,
        tone: Math.abs(recentPerWeek) / w[w.length - 1].value > 0.01 ? "warn" : "good",
      });
    }
  }

  const vo2 = seriesFrom(dataset.vo2max, (v) => v.value);
  const vo2Fit = fitTrend(vo2.slice(-24));
  if (vo2Fit && vo2.length > 8) {
    const perMonth = slopePerMonth(vo2Fit);
    if (Math.abs(perMonth) < 0.08 && vo2.length > 12) {
      out.push({
        id: "vo2-flat",
        category: "training",
        title: "VO₂max has stopped moving",
        evidence: `The trend across your last ${vo2.length} readings is ${perMonth >= 0 ? "+" : ""}${perMonth.toFixed(2)} per month — flat within measurement noise.`,
        action:
          "Steady-state volume alone stops driving VO₂max once you are trained. Adding one interval session a week — 4–6 × 3 min hard — is the usual unlock.",
        effect: "High-intensity intervals are the best-evidenced stimulus for VO₂max specifically, as distinct from endurance.",
        priority: 68,
        tone: "warn",
      });
    } else if (perMonth > 0.15) {
      out.push({
        id: "vo2-rising",
        category: "training",
        title: `VO₂max climbing ${perMonth.toFixed(2)}/month`,
        evidence: `Current estimate ${vo2[vo2.length - 1].value.toFixed(1)}, trending up ${perMonth.toFixed(2)} per month.`,
        action: "Keep the current mix. Re-assess in six weeks — this rate rarely sustains past a few months without a change in stimulus.",
        effect: "No change needed.",
        priority: 28,
        tone: "good",
      });
    }
  }

  return out;
}
