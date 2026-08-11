/**
 * Insights — the ranked "what to change" list.
 *
 * Each card is deliberately three-part: what the data says, what to do, and
 * what it is worth. The third part is the one most dashboards skip, and it is
 * the one that lets someone decide whether a recommendation is worth their
 * week.
 *
 * Cards are capped. A list of twenty recommendations is a list of zero.
 */

import { useState } from "react";
import {
  Barbell,
  CheckCircle,
  Heartbeat,
  Moon,
  Scales,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import { CoverageNotice, EmptyState, Panel } from "@/components/primitives";
import type { Deck } from "@/lib/deck";
import type { Insight, InsightCategory } from "@/lib/model/insights";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  InsightCategory,
  { label: string; icon: React.ReactNode }
> = {
  training: { label: "Training", icon: <Barbell size={14} weight="fill" aria-hidden="true" /> },
  recovery: { label: "Recovery", icon: <Moon size={14} weight="fill" aria-hidden="true" /> },
  body: { label: "Body", icon: <Scales size={14} weight="fill" aria-hidden="true" /> },
  consistency: { label: "Consistency", icon: <Heartbeat size={14} weight="fill" aria-hidden="true" /> },
};

const FILTERS: { value: InsightCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "training", label: "Training" },
  { value: "recovery", label: "Recovery" },
  { value: "body", label: "Body" },
  { value: "consistency", label: "Consistency" },
];

export function InsightsView({ deck }: { deck: Deck }) {
  const [filter, setFilter] = useState<InsightCategory | "all">("all");

  const shown = deck.insights
    .filter((i) => filter === "all" || i.category === filter)
    .slice(0, 8);

  const actionable = deck.insights.filter((i) => i.tone !== "good").length;
  const hasAny = deck.insights.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <CoverageNotice spanDays={deck.spanDays} needDays={28} what="Spotting a pattern" />

      <Panel
        label="Priorities"
        sub={
          !hasAny
            ? "No rule has enough data to fire yet — which is not the same as nothing being wrong."
            : actionable === 0
              ? "Nothing needs changing. The numbers below are working."
              : `${actionable} thing${actionable === 1 ? "" : "s"} worth acting on, ordered by what would move the needle most.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={cn(
                  "eyebrow touch-manipulation rounded-full px-2.5 py-1.5 transition-colors",
                  filter === f.value
                    ? "bg-load text-on-load"
                    : "text-ink-faint hover:bg-overlay hover:text-ink-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          filter === "all" ? (
            <ThresholdList deck={deck} />
          ) : (
            <EmptyState
              title="Nothing in this category yet"
              detail="No findings here. Try another filter, or switch to All to see what each rule is still waiting for."
            />
          )
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        )}
      </Panel>

      <p className="px-1 text-[12px] leading-relaxed text-ink-faint">
        These are pattern-matching rules over your own data, not medical advice. Effect sizes come
        from published intervention research and describe typical responses, not guarantees. If
        something here conflicts with guidance from a doctor or a coach who knows your history,
        theirs wins.
      </p>
    </div>
  );
}

/**
 * Shown instead of a bare "no insights" message.
 *
 * Every rule has a minimum sample size, and silence from a rule is
 * indistinguishable from "you're fine" unless the thresholds are stated. This
 * lists what each one needs and how close the data is.
 */
function ThresholdList({ deck }: { deck: Deck }) {
  const rows = [
    { label: "Sleep patterns", have: deck.sleep.length, need: 14, unit: "nights" },
    { label: "Training load and intensity", have: deck.spanDays, need: 28, unit: "days" },
    { label: "Resting HR and HRV trends", have: deck.series.restingHr.length, need: 30, unit: "readings" },
    { label: "Weight trend and plateaus", have: deck.series.weight.length, need: 21, unit: "weigh-ins" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] text-[13px] leading-relaxed text-ink-muted">
        Nothing yet — not because everything is fine, but because each rule needs
        enough data to tell a pattern from a coincidence. Here is what each one is
        waiting for.
      </p>

      <div className="flex flex-col">
        {rows.map((r) => {
          const pct = Math.min(100, (r.have / r.need) * 100);
          return (
            <div key={r.label} className="border-b border-line/60 py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13px] text-ink">{r.label}</span>
                <span className="shrink-0 font-mono text-[12px] text-ink-muted">
                  {r.have}
                  <span className="text-ink-faint">/{r.need} {r.unit}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-load/60")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const meta = CATEGORY_META[insight.category];

  const tone = {
    good: { border: "border-l-success", icon: <CheckCircle size={15} weight="fill" className="text-success" aria-hidden="true" /> },
    warn: { border: "border-l-warning", icon: <Warning size={15} weight="fill" className="text-warning" aria-hidden="true" /> },
    risk: { border: "border-l-error", icon: <WarningOctagon size={15} weight="fill" className="text-error" aria-hidden="true" /> },
  }[insight.tone];

  return (
    <article className={cn("rounded-md border border-line border-l-2 bg-surface", tone.border)}>
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <span className="mt-0.5 shrink-0">{tone.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="font-display text-[15px] leading-snug font-semibold text-ink">
              {insight.title}
            </h3>
            <span className="flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-ink-faint">
              <span className="shrink-0">{meta.icon}</span>
              <span className="eyebrow">{meta.label}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex max-w-[78ch] flex-col gap-2.5 px-4 pt-2.5 pb-4 pl-[42px]">
        <Part label="What the data shows" body={insight.evidence} />
        <Part label="What to do" body={insight.action} emphasis />
        <Part label="What it's worth" body={insight.effect} />
      </div>
    </article>
  );
}

function Part({ label, body, emphasis }: { label: string; body: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <p
        className={cn(
          "text-[13px] leading-relaxed",
          emphasis ? "text-ink" : "text-ink-muted",
        )}
      >
        {body}
      </p>
    </div>
  );
}
