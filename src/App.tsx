/**
 * The deck shell: navigation, range, units, and the profile the model needs.
 *
 * State lives here rather than in a store because there is exactly one dataset
 * and one range, and every view is a pure function of them. A context would add
 * indirection without removing a single prop.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Barbell,
  ChartLineUp,
  DownloadSimple,
  Gauge,
  Lightbulb,
  Moon,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { ImportPanel } from "@/components/ImportPanel";
import { ChipRow, NumberSlider, Panel } from "@/components/primitives";
import { OverviewView } from "@/views/OverviewView";
import { TrainingView } from "@/views/TrainingView";
import { RecoveryView } from "@/views/RecoveryView";
import { TrajectoryView } from "@/views/TrajectoryView";
import { InsightsView } from "@/views/InsightsView";
import { buildDemoDataset } from "@/lib/garmin/demo";
import { useDeck } from "@/lib/deck";
import { type RangeKey } from "@/lib/garmin/derive";
import type { GarminDataset, UserProfile } from "@/lib/garmin/types";
import { mediumDate, type UnitSystem } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "overview" | "training" | "recovery" | "trajectory" | "insights";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Gauge size={16} weight="fill" /> },
  { id: "trajectory", label: "Trajectory", icon: <ChartLineUp size={16} weight="fill" /> },
  { id: "training", label: "Training", icon: <Barbell size={16} weight="fill" /> },
  { id: "recovery", label: "Recovery", icon: <Moon size={16} weight="fill" /> },
  { id: "insights", label: "Insights", icon: <Lightbulb size={16} weight="fill" /> },
];

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "ALL" },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

/** Reads the tab out of the URL hash so a view can be linked to and survives a reload. */
function tabFromHash(): Tab {
  const h = window.location.hash.replace(/^#\/?/, "");
  return TAB_IDS.has(h) ? (h as Tab) : "overview";
}

export default function App() {
  const [dataset, setDataset] = useState<GarminDataset>(() => buildDemoDataset());
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [range, setRange] = useState<RangeKey>("90d");
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [importing, setImporting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const deck = useDeck(dataset, range);

  const setProfile = (patch: Partial<UserProfile>) =>
    setDataset((d) => ({ ...d, profile: { ...d.profile, ...patch } }));

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
  }, []);

  // Keeps back/forward and hand-edited URLs in sync with the visible tab.
  useEffect(() => {
    const onHashChange = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="deck-grid min-h-dvh">
      <a
        href="#deck-panel"
        className="sr-only rounded-full bg-load px-4 py-2 text-[13px] font-semibold text-on-load focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to dashboard
      </a>

      <Header
        dataset={dataset}
        range={range}
        setRange={setRange}
        units={units}
        setUnits={setUnits}
        onImport={() => setImporting(true)}
        onProfile={() => setProfileOpen((v) => !v)}
      />

      <Nav tab={tab} setTab={setTab} />

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 sm:px-6">
        {profileOpen && (
          <div className="mb-4">
            <ProfilePanel
              profile={dataset.profile}
              units={units}
              onChange={setProfile}
              onClose={() => setProfileOpen(false)}
            />
          </div>
        )}

        <div
          key={tab}
          id="deck-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          tabIndex={-1}
          className="animate-in-up scroll-mt-32 focus:outline-none"
        >
          {tab === "overview" && <OverviewView deck={deck} dataset={dataset} units={units} />}
          {tab === "trajectory" && (
            <TrajectoryView deck={deck} dataset={dataset} units={units} />
          )}
          {tab === "training" && <TrainingView deck={deck} units={units} />}
          {tab === "recovery" && <RecoveryView deck={deck} />}
          {tab === "insights" && <InsightsView deck={deck} />}
        </div>
      </main>

      {importing && (
        <ImportPanel
          units={units}
          profile={dataset.profile}
          onClose={() => setImporting(false)}
          onLoaded={(d) => {
            setDataset(d);
            setImporting(false);
            setRange("90d");
          }}
        />
      )}
    </div>
  );
}

/* ── header ─────────────────────────────────────────────────────────────── */

function Header({
  dataset,
  range,
  setRange,
  units,
  setUnits,
  onImport,
  onProfile,
}: {
  dataset: GarminDataset;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  units: UnitSystem;
  setUnits: (u: UnitSystem) => void;
  onImport: () => void;
  onProfile: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised">
            <Gauge size={17} weight="fill" className="text-load" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
              Flight Deck
            </h1>
            <p className="mt-1 truncate font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
              {dataset.meta.lastDate
                ? `Through ${mediumDate(dataset.meta.lastDate)}`
                : "No data"}
            </p>
          </div>
        </div>

        {dataset.meta.isDemo && (
          <span className="flex items-center gap-1.5 rounded-full border border-energy/30 bg-energy/10 px-2.5 py-1">
            <span className="size-1.5 rounded-full bg-energy" />
            <span className="eyebrow text-energy">Sample data</span>
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ChipRow options={RANGES} value={range} onChange={setRange} ariaLabel="Date range" />

          <ChipRow
            options={[
              { value: "metric" as const, label: "KG" },
              { value: "imperial" as const, label: "LB" },
            ]}
            value={units}
            onChange={setUnits}
            ariaLabel="Units"
          />

          <button
            onClick={onProfile}
            aria-label="Profile settings"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-2 text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
          >
            <SlidersHorizontal size={13} weight="bold" aria-hidden="true" />
            <span className="eyebrow hidden sm:inline">Profile</span>
          </button>

          <button
            onClick={onImport}
            className="flex items-center gap-1.5 rounded-full bg-load px-3 py-2 text-on-load transition-opacity hover:opacity-90"
          >
            <DownloadSimple size={13} weight="bold" aria-hidden="true" />
            <span className="eyebrow">Import</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── nav ────────────────────────────────────────────────────────────────── */

/**
 * Section tabs.
 *
 * Implements the full tab pattern rather than just the look: roving tabindex so
 * the group is one stop in the tab order, arrow keys to move between tabs, and
 * `aria-controls` pointing at the real panel. Without the roving tabindex a
 * keyboard user has to press Tab five times to get past the navigation on every
 * single page.
 */
function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();

    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? TABS.length - 1
          : (i + dir + TABS.length) % TABS.length;

    setTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  return (
    <nav className="sticky top-[57px] z-20 mb-4 border-b border-line bg-base/85 backdrop-blur-md">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <div
          role="tablist"
          aria-label="Dashboard sections"
          onKeyDown={onKeyDown}
          className="flex gap-1 overflow-x-auto"
        >
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="deck-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex shrink-0 touch-manipulation items-center gap-2 px-3 py-3 transition-colors",
                  active ? "text-ink" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                <span aria-hidden="true" className={active ? "text-load" : undefined}>
                  {t.icon}
                </span>
                <span className="text-[13px] font-medium">{t.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-load"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ── profile ────────────────────────────────────────────────────────────── */

/**
 * Height, age, and sex feed the BMR equations, so a wrong value here shifts
 * every energy number in the app. Garmin's export does not reliably include
 * them, which is why this is editable rather than inferred.
 */
function ProfilePanel({
  profile,
  units,
  onChange,
  onClose,
}: {
  profile: UserProfile;
  units: UnitSystem;
  onChange: (p: Partial<UserProfile>) => void;
  onClose: () => void;
}) {
  const heightDisplay = useMemo(
    () =>
      units === "imperial"
        ? `${Math.floor(profile.heightCm / 2.54 / 12)}′${Math.round((profile.heightCm / 2.54) % 12)}″`
        : `${profile.heightCm} cm`,
    [profile.heightCm, units],
  );

  return (
    <Panel
      label="Profile"
      sub="These feed the metabolic equations, so accuracy here changes every calorie number in the app."
      actions={
        <button
          onClick={onClose}
          aria-label="Close profile"
          className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-overlay hover:text-ink"
        >
          <X size={15} weight="bold" aria-hidden="true" />
        </button>
      }
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <Field label="Height" value={heightDisplay}>
          <NumberSlider
            value={profile.heightCm}
            onChange={(v) => onChange({ heightCm: v })}
            min={140}
            max={215}
            step={1}
            ariaLabel="Height in centimetres"
          />
        </Field>

        <Field label="Age" value={`${profile.age} years`}>
          <NumberSlider
            value={profile.age}
            onChange={(v) => onChange({ age: v })}
            min={16}
            max={90}
            step={1}
            ariaLabel="Age in years"
          />
        </Field>

        <Field label="Sex" value={profile.sex === "male" ? "Male" : "Female"}>
          <div className="pt-1">
            <ChipRow
              options={[
                { value: "male" as const, label: "Male" },
                { value: "female" as const, label: "Female" },
              ]}
              value={profile.sex}
              onChange={(v) => onChange({ sex: v })}
              ariaLabel="Sex for metabolic equations"
            />
          </div>
        </Field>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
        Sex is used only as a term in the Mifflin-St Jeor equation, which was validated with two
        coefficients. If neither fits you, pick whichever gives a resting rate closer to what you
        know your maintenance to be — or rely on the body-composition path instead, which uses lean
        mass and has no sex term at all.
      </p>
    </Panel>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="font-mono text-[13px] text-ink-muted">{value}</span>
      </div>
      {children}
    </div>
  );
}
