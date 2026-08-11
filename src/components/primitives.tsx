/**
 * The five pieces every panel in the deck is built from.
 *
 * Kept deliberately small: a Panel is a bordered surface with an eyebrow, a
 * StatTile is a labelled readout, and a Delta is a signed comparison that
 * always states its own window. Nothing here knows what a heart rate is.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

/* ── panel ──────────────────────────────────────────────────────────────── */

export function Panel({
  label,
  sub,
  actions,
  children,
  className,
  bleed,
}: {
  /** The `label-caps` eyebrow naming what this panel measures. */
  label: string;
  /** The window it covers — every measurement needs its range stated. */
  sub?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Lets charts run to the panel edge instead of sitting inside the padding. */
  bleed?: boolean;
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      {/* Stacks below sm: with actions on the same row, a chip group would
          otherwise squeeze the description into a two-word-wide column. */}
      <header className="flex flex-col gap-3 px-5 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
        {actions && <div className="order-1 shrink-0 sm:order-2">{actions}</div>}
        <div className="order-2 min-w-0 sm:order-1">
          <h2 className="eyebrow">{label}</h2>
          {sub && <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">{sub}</p>}
        </div>
      </header>
      <div className={cn("min-w-0 flex-1", bleed ? "pb-3" : "px-5 pb-5")}>{children}</div>
    </section>
  );
}

/* ── readouts ───────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  unit,
  delta,
  accent = "ink",
  footnote,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: ReactNode;
  accent?: AccentName;
  footnote?: string;
  /** Slot for a sparkline under the readout. */
  children?: ReactNode;
}) {
  return (
    <div className="panel flex min-w-0 flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", ACCENT_BG[accent])} />
        <h3 className="eyebrow truncate">{label}</h3>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-[27px] leading-none font-medium tracking-tight",
            ACCENT_TEXT[accent],
          )}
        >
          {value}
        </span>
        {unit && <span className="font-mono text-[13px] text-ink-faint">{unit}</span>}
      </div>

      {children}

      {delta}
      {footnote && <p className="text-[11px] leading-tight text-ink-faint">{footnote}</p>}
    </div>
  );
}

/**
 * A signed comparison. Always carries its window in words — a bare arrow
 * tells you a direction but never says "since when", which is the only part
 * that makes a delta actionable.
 */
export function Delta({
  value,
  window,
  unit = "",
  /** For metrics where down is good — resting HR, weight, stress. */
  invert = false,
  dp = 1,
  neutral = false,
}: {
  value: number;
  window: string;
  unit?: string;
  invert?: boolean;
  dp?: number;
  neutral?: boolean;
}) {
  if (!Number.isFinite(value)) return null;

  const improving = invert ? value < 0 : value > 0;
  const flat = Math.abs(value) < Math.pow(10, -dp) / 2;

  const tone = neutral || flat ? "text-ink-faint" : improving ? "text-success" : "text-warning";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";

  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-tight">
      <span className={cn("font-mono font-medium", tone)}>
        {flat ? "±0" : `${sign}${Math.abs(value).toFixed(dp)}`}
        {unit}
      </span>
      <span className="text-ink-faint">{window}</span>
    </p>
  );
}

/* ── accents ────────────────────────────────────────────────────────────── */

export type AccentName = "load" | "recovery" | "cardiac" | "energy" | "mass" | "ink";

export const ACCENT_HEX: Record<AccentName, string> = {
  load: "#b8f23c",
  recovery: "#45d6f5",
  cardiac: "#ff6b6b",
  energy: "#ffc46b",
  mass: "#c3d0e0",
  ink: "#e9f0f7",
};

const ACCENT_BG: Record<AccentName, string> = {
  load: "bg-load",
  recovery: "bg-recovery",
  cardiac: "bg-cardiac",
  energy: "bg-energy",
  mass: "bg-mass",
  ink: "bg-ink-faint",
};

const ACCENT_TEXT: Record<AccentName, string> = {
  load: "text-load",
  recovery: "text-recovery",
  cardiac: "text-cardiac",
  energy: "text-energy",
  mass: "text-mass",
  ink: "text-ink",
};

/* ── controls ───────────────────────────────────────────────────────────── */

/**
 * Segmented single-select — range, units, insight category.
 *
 * Deliberately NOT `role="tablist"`. These pick a value; they do not reveal
 * panels, and tab semantics promise a `tabpanel` with `aria-controls` that does
 * not exist here. A labelled group of `aria-pressed` toggles describes what
 * these actually are, and screen readers announce the state correctly.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "eyebrow touch-manipulation rounded-full px-2.5 py-1.5 transition-colors",
              active
                ? "bg-load text-on-load"
                : "text-ink-faint hover:bg-overlay hover:text-ink-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Single-value slider.
 *
 * Base UI's slider is range-capable, so it hands back `number | readonly
 * number[]`. Every slider in this app is single-valued, so the narrowing is
 * done once here rather than at each call site.
 */
export function NumberSlider({
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
}) {
  return (
    <Slider
      value={[value]}
      onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
    />
  );
}

/* ── states ─────────────────────────────────────────────────────────────── */

/**
 * Says out loud when the dataset is too thin for what a view normally shows.
 *
 * A dashboard that renders a 42-day fitness baseline from six days of data is
 * not empty, it is wrong — and wrong is harder to notice than missing. This
 * banner names the shortfall so the numbers below it can be read at the right
 * confidence.
 */
export function CoverageNotice({
  spanDays,
  needDays,
  what,
}: {
  spanDays: number;
  needDays: number;
  what: string;
}) {
  if (spanDays >= needDays) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/5 px-3.5 py-3">
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Your export covers{" "}
        <span className="font-mono text-ink">
          {spanDays} day{spanDays === 1 ? "" : "s"}
        </span>
        . {what} normally takes about {needDays}, so treat what follows as a first
        reading rather than a trend — it firms up as the watch records more.
      </p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-display text-[15px] font-semibold text-ink-muted">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-ink-faint">{detail}</p>
    </div>
  );
}

/** A labelled key/value row, used inside dense breakdown panels. */
export function Row({
  label,
  value,
  accent,
  emphasis,
}: {
  label: string;
  value: string;
  accent?: AccentName;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className="flex min-w-0 items-center gap-2">
        {accent && <span className={cn("size-1.5 shrink-0 rounded-full", ACCENT_BG[accent])} />}
        <span className="truncate text-[13px] text-ink-muted">{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[13px]",
          emphasis ? "font-medium text-ink" : "text-ink-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
