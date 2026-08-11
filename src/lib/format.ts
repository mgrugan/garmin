/**
 * Display formatting.
 *
 * The app computes in metric throughout and converts only here, at the edge,
 * so no calculation ever has to ask which unit it is holding.
 */

export type UnitSystem = "metric" | "imperial";

const LB_PER_KG = 2.2046226;
const MI_PER_KM = 0.6213712;

export function kg(value: number, units: UnitSystem, dp = 1): string {
  return units === "imperial"
    ? `${(value * LB_PER_KG).toFixed(dp)}`
    : `${value.toFixed(dp)}`;
}

export function kgUnit(units: UnitSystem): string {
  return units === "imperial" ? "lb" : "kg";
}

export function toDisplayMass(value: number, units: UnitSystem): number {
  return units === "imperial" ? value * LB_PER_KG : value;
}

export function fromDisplayMass(value: number, units: UnitSystem): number {
  return units === "imperial" ? value / LB_PER_KG : value;
}

/**
 * Protein is modelled in g/kg — the unit the literature uses — but read in
 * g/lb by anyone thinking in pounds, where "about a gram per pound" is the
 * familiar rule of thumb (and lands at 2.2 g/kg, the top of the useful range).
 */
export function toDisplayProtein(gPerKg: number, units: UnitSystem): number {
  return units === "imperial" ? gPerKg / LB_PER_KG : gPerKg;
}

export function proteinUnit(units: UnitSystem): string {
  return units === "imperial" ? "g/lb" : "g/kg";
}

/** The muscle-sparing band, 1.6–2.2 g/kg, written in the reader's unit. */
export function proteinTargetRange(units: UnitSystem): string {
  return units === "imperial" ? "0.7–1.0 g/lb" : "1.6–2.2 g/kg";
}

export function km(value: number, units: UnitSystem, dp = 1): string {
  return units === "imperial" ? (value * MI_PER_KM).toFixed(dp) : value.toFixed(dp);
}

export function kmUnit(units: UnitSystem): string {
  return units === "imperial" ? "mi" : "km";
}

/** 412 → "6h 52m". Minutes are the app's internal duration unit. */
export function hoursMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Decimal hours, for axis ticks where "6h 52m" is too wide. */
export function decimalHours(minutes: number, dp = 1): string {
  return (minutes / 60).toFixed(dp);
}

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function signed(n: number, dp = 1): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(dp);
  return n > 0 ? `+${s}` : s;
}

/** 5.42 min/km → "5:25". */
export function pace(minPerKm: number, units: UnitSystem): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const v = units === "imperial" ? minPerKm / MI_PER_KM : minPerKm;
  const m = Math.floor(v);
  const s = Math.round((v - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function mediumDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "in 14 weeks" / "in 3 months" — chosen by magnitude so it reads naturally. */
export function horizonPhrase(days: number): string {
  if (days < 14) return `${days} days`;
  if (days < 84) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}
