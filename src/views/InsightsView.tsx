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
import { EmptyState, Panel } from "@/components/primitives";
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

  return (
    <div className="flex flex-col gap-4">
      <Panel
        label="Priorities"
        sub={
          actionable === 0
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
          <EmptyState
            title="Nothing to report here"
            detail={
              filter === "all"
                ? "Insights need a few weeks of data across sleep, training, and body mass before they can say anything useful."
                : "No findings in this category. Try another filter."
            }
          />
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
