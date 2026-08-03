import { describe, expect, it } from "vitest";

import { bisect, clamp, linearFit, logGamma, normalCdf, normalPdf, stdDev } from "./math";

describe("normalCdf", () => {
  it("matches reference values to 12 decimal places", () => {
    // Reference values from the standard normal distribution.
    expect(normalCdf(0)).toBeCloseTo(0.5, 14);
    expect(normalCdf(1)).toBeCloseTo(0.841344746068543, 12);
    expect(normalCdf(-1)).toBeCloseTo(0.158655253931457, 12);
    expect(normalCdf(1.96)).toBeCloseTo(0.975002104851780, 12);
    expect(normalCdf(-1.96)).toBeCloseTo(0.024997895148220, 12);
    expect(normalCdf(2)).toBeCloseTo(0.977249868051821, 12);
    expect(normalCdf(-3)).toBeCloseTo(0.001349898031630, 12);
  });

  it("stays accurate deep in the tail, where lopsided lines get priced", () => {
    // Absolute closeness is uninformative once values are this small; assert
    // relative error instead.
    const relativeError = (x: number, reference: number) =>
      Math.abs(normalCdf(x) - reference) / reference;

    expect(relativeError(-5, 2.866515718791939e-7)).toBeLessThan(1e-9);
    expect(relativeError(-8, 6.220960574271786e-16)).toBeLessThan(1e-7);
    // A cruder approximation would return a negative or zero probability here.
    expect(normalCdf(-8)).toBeGreaterThan(0);
  });

  it("is symmetric", () => {
    for (const x of [0.3, 1.1, 2.7, 4.2, 7.5]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 14);
    }
  });

  it("handles infinities", () => {
    expect(normalCdf(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalCdf(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("normalPdf", () => {
  it("matches reference values", () => {
    expect(normalPdf(0)).toBeCloseTo(0.398942280401433, 14);
    expect(normalPdf(1)).toBeCloseTo(0.241970724519143, 14);
  });
});

describe("logGamma", () => {
  it("reproduces factorials", () => {
    expect(logGamma(1)).toBeCloseTo(0, 10);
    expect(logGamma(2)).toBeCloseTo(0, 10);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(10)).toBeCloseTo(Math.log(362880), 10);
  });

  it("handles half-integers", () => {
    // Gamma(1/2) = sqrt(pi)
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  });
});

describe("bisect", () => {
  it("finds a root of a monotone function", () => {
    const root = bisect((x) => x * x - 2, 0, 3);
    expect(root).toBeCloseTo(Math.SQRT2, 10);
  });

  it("returns the closer endpoint when no root is bracketed", () => {
    const result = bisect((x) => x + 10, 0, 5);
    expect(result).toBe(0);
  });
});

describe("clamp", () => {
  it("bounds values", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(1.5, 0, 3)).toBe(1.5);
  });

  it("maps NaN to the lower bound rather than propagating it", () => {
    expect(clamp(Number.NaN, 0, 3)).toBe(0);
  });
});

describe("stdDev", () => {
  it("uses the n-1 denominator", () => {
    // Sample variance of [2,4,4,4,5,5,7,9] is 32/7.
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it("needs at least two observations", () => {
    expect(stdDev([5])).toBeNull();
    expect(stdDev([])).toBeNull();
  });
});

describe("linearFit", () => {
  it("recovers a known line exactly", () => {
    const fit = linearFit([
      { x: 0, y: 3 },
      { x: 1, y: 5 },
      { x: 2, y: 7 },
      { x: 3, y: 9 },
    ]);
    expect(fit?.intercept).toBeCloseTo(3, 10);
    expect(fit?.slope).toBeCloseTo(2, 10);
  });

  it("returns null when the fit is degenerate", () => {
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearFit([
        { x: 2, y: 1 },
        { x: 2, y: 5 },
      ]),
    ).toBeNull();
  });
});
