/**
 * Special functions needed by the distribution models.
 *
 * Implemented locally rather than pulled from a dependency so the engine stays
 * dependency-free and the numerics are auditable/testable.
 */

/**
 * Standard normal CDF via Hart's (1968) rational approximation.
 *
 * Absolute error stays below ~1e-15 everywhere. Relative error is ~1e-14 through
 * the body of the distribution, loosening to ~1e-8 by eight sigma out. That is
 * far tighter than the commonly copied Zelen & Severo approximation (~7.5e-8
 * absolute), which loses all significant digits in the tails — exactly where
 * lopsided prop lines get priced.
 */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;

  const z = Math.abs(x);
  let upperTail: number;

  if (z > 37) {
    upperTail = 0;
  } else {
    const e = Math.exp((-z * z) / 2);
    if (z < 7.07106781186547) {
      let num = 3.52624965998911e-2 * z + 0.700383064443688;
      num = num * z + 6.37396220353165;
      num = num * z + 33.912866078383;
      num = num * z + 112.079291497871;
      num = num * z + 221.213596169931;
      num = num * z + 220.206867912376;

      let den = 8.83883476483184e-2 * z + 1.75566716318264;
      den = den * z + 16.064177579207;
      den = den * z + 86.7807322029461;
      den = den * z + 296.564248779674;
      den = den * z + 637.333633378831;
      den = den * z + 793.826512519948;
      den = den * z + 440.413735824752;

      upperTail = (e * num) / den;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      upperTail = e / (b * 2.506628274631);
    }
  }

  return x > 0 ? 1 - upperTail : upperTail;
}

/** Standard normal probability density. */
export function normalPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula, for completeness. Count distributions never hit this.
    return (
      Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x)
    );
  }

  const z = x - 1;
  let series = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_G + 2; i += 1) {
    series += LANCZOS_COEFFICIENTS[i] / (z + i);
  }
  const t = z + LANCZOS_G + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(series)
  );
}

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Find a root of `f` on `[lo, hi]` by bisection.
 * Used for the truncated-normal mean solve and the power de-vig solve — both
 * are smooth and monotone, so bisection is plenty and cannot diverge.
 */
export function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tolerance = 1e-12,
  maxIterations = 200,
): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);

  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) {
    // No sign change bracketed; return whichever endpoint is closer to zero.
    return Math.abs(fa) < Math.abs(fb) ? a : b;
  }

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (a + b) / 2;
    const fMid = f(mid);
    if (fMid === 0 || (b - a) / 2 < tolerance) return mid;
    if (fa * fMid < 0) {
      b = mid;
    } else {
      a = mid;
      fa = fMid;
    }
  }

  return (a + b) / 2;
}

/** Mean of a numeric array, or `null` when empty. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Sample standard deviation (n-1 denominator), or `null` with fewer than 2 values. */
export function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mu = mean(values)!;
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - mu) ** 2;
  return Math.sqrt(sumSquares / (values.length - 1));
}

/** Ordinary least squares fit of `y = intercept + slope * x`. */
export function linearFit(
  points: ReadonlyArray<{ x: number; y: number }>,
): { intercept: number; slope: number } | null {
  if (points.length < 2) return null;

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}
