/**
 * Trend estimation and projection for the scalar metrics (VO2max, resting HR,
 * sleep, HRV, weight).
 *
 * Ordinary least squares is the wrong tool here. A single week of illness or a
 * strap worn loosely produces outliers that drag an OLS slope noticeably, and
 * the resulting forecast is then confidently wrong. Theil-Sen takes the median
 * of all pairwise slopes instead, so it tolerates up to ~29% contaminated
 * points before it breaks down — which is roughly what real wearable data
 * looks like.
 */

export interface Series {
  date: string;
  value: number;
}

export interface TrendFit {
  /** Units per day. */
  slope: number;
  intercept: number;
  /** Index of the first point, so x is days since series start. */
  originMs: number;
  /** Residual standard deviation, used to size the prediction cone. */
  sigma: number;
  n: number;
  /** Fraction of variance explained; low values mean "flat, don't over-read". */
  r2: number;
}

export interface ForecastPoint {
  date: string;
  value: number | null;
  projected: number | null;
  lo: number | null;
  hi: number | null;
}

const DAY_MS = 86_400_000;

export function fitTrend(series: Series[]): TrendFit | null {
  const pts = series
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ x: Date.parse(p.date), y: p.value }))
    .filter((p) => Number.isFinite(p.x))
    .sort((a, b) => a.x - b.x);

  if (pts.length < 4) return null;

  const originMs = pts[0].x;
  const xs = pts.map((p) => (p.x - originMs) / DAY_MS);
  const ys = pts.map((p) => p.y);

  const slope = theilSenSlope(xs, ys);
  // Median-based intercept keeps the fit robust end to end.
  const intercept = median(ys.map((y, i) => y - slope * xs[i]));

  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const sigma = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, residuals.length - 2));

  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = residuals.reduce((a, r) => a + r * r, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, originMs, sigma, n: pts.length, r2 };
}

/**
 * Median of pairwise slopes. Capped at ~400 points by uniform subsampling:
 * the estimator is O(n²) and 400 points already gives a stable median, while
 * three years of daily data would otherwise mean half a million pairs on every
 * slider drag.
 */
function theilSenSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const stride = n > 400 ? Math.ceil(n / 400) : 1;

  const slopes: number[] = [];
  for (let i = 0; i < n; i += stride) {
    for (let j = i + stride; j < n; j += stride) {
      const dx = xs[j] - xs[i];
      if (dx > 0) slopes.push((ys[j] - ys[i]) / dx);
    }
  }
  return slopes.length ? median(slopes) : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Projects `horizonDays` past the last observation.
 *
 * The cone widens with √(days ahead) rather than linearly. Physiological
 * metrics are mean-reverting — a bad week is followed by a normal one — so
 * uncertainty accumulates like a random walk, not like compounding error.
 */
export function project(series: Series[], horizonDays: number, fit?: TrendFit | null): ForecastPoint[] {
  const f = fit ?? fitTrend(series);
  const out: ForecastPoint[] = series.map((p) => ({
    date: p.date,
    value: p.value,
    projected: null,
    lo: null,
    hi: null,
  }));

  if (!f || !series.length) return out;

  const last = series[series.length - 1];
  const lastX = (Date.parse(last.date) - f.originMs) / DAY_MS;

  // Join the projection to the observed series so the line is continuous.
  out[out.length - 1] = { ...out[out.length - 1], projected: last.value, lo: last.value, hi: last.value };

  for (let d = 1; d <= horizonDays; d++) {
    const x = lastX + d;
    const value = f.intercept + f.slope * x;
    // 1.96σ ≈ 95%, scaled by the random-walk term.
    const spread = 1.96 * f.sigma * Math.sqrt(d / 14 + 0.35);
    out.push({
      date: shiftDate(last.date, d),
      value: null,
      projected: value,
      lo: value - spread,
      hi: value + spread,
    });
  }
  return out;
}

/** Change per 30 days, the unit people actually reason about. */
export function slopePerMonth(fit: TrendFit | null): number {
  return fit ? fit.slope * 30 : 0;
}

/**
 * Whether a trend is worth reporting at all. A slope smaller than the noise it
 * sits in is not a trend, and presenting it as one is how dashboards lie.
 */
export function isTrendMeaningful(fit: TrendFit | null, horizonDays = 90): boolean {
  if (!fit || fit.n < 10) return false;
  return Math.abs(fit.slope * horizonDays) > fit.sigma * 0.5;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
