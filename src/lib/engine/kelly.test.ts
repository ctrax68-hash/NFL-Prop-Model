import { describe, expect, it } from "vitest";

import { kellyFraction, sizeBet, unitsToStake } from "./kelly";
import { DEFAULT_CONFIG, withConfig } from "./config";

describe("kellyFraction", () => {
  it("matches a hand-computed example", () => {
    // p = 0.55 at -110. b = 10/11, q = 0.45.
    // f* = (b*p - q) / b = (0.5 - 0.45) / (10/11) = 0.055
    expect(kellyFraction({ probWin: 0.55, oddsAmerican: -110 })).toBeCloseTo(
      0.055,
      12,
    );
  });

  it("is zero at the break-even probability", () => {
    expect(
      kellyFraction({ probWin: 11 / 21, oddsAmerican: -110 }),
    ).toBeCloseTo(0, 12);
  });

  it("returns zero rather than a negative stake when the bet is -EV", () => {
    expect(kellyFraction({ probWin: 0.4, oddsAmerican: -110 })).toBe(0);
    expect(kellyFraction({ probWin: 0.1, oddsAmerican: 100 })).toBe(0);
  });

  it("stakes the full bankroll only on a certainty", () => {
    expect(kellyFraction({ probWin: 1, oddsAmerican: 100 })).toBeCloseTo(1, 12);
  });

  it("handles pushes by conditioning on a decisive result", () => {
    // 50% win / 10% push / 40% lose at +100.
    // f* = (1*0.5 - 0.4) / (1 * 0.9) = 1/9
    expect(
      kellyFraction({ probWin: 0.5, probPush: 0.1, oddsAmerican: 100 }),
    ).toBeCloseTo(1 / 9, 12);
  });

  it("reduces to the textbook formula when there is no push", () => {
    for (const p of [0.52, 0.6, 0.75]) {
      const withPushArg = kellyFraction({
        probWin: p,
        probPush: 0,
        oddsAmerican: -120,
      });
      const withoutPushArg = kellyFraction({ probWin: p, oddsAmerican: -120 });
      expect(withPushArg).toBeCloseTo(withoutPushArg, 14);
    }
  });

  it("sizes a push-heavy bet smaller than the same edge without a push", () => {
    // Both have the same win:lose ratio, but the push version risks less often.
    const noPush = kellyFraction({ probWin: 0.55, oddsAmerican: 100 });
    const withPush = kellyFraction({
      probWin: 0.44,
      probPush: 0.2,
      oddsAmerican: 100,
    });
    expect(withPush).toBeLessThan(noPush);
  });
});

describe("sizeBet", () => {
  it("applies the fractional multiplier and unit conversion", () => {
    // f* = 0.055, quarter Kelly -> 0.01375 of bankroll -> 1.375 units.
    const result = sizeBet(
      { probWin: 0.55, oddsAmerican: -110 },
      withConfig({ kelly: { maxUnits: 10, roundToUnits: 0.001 } }),
    );
    expect(result.kellyFractionRaw).toBeCloseTo(0.055, 12);
    expect(result.kellyFractionFractional).toBeCloseTo(0.01375, 12);
    expect(result.recommendedUnits).toBeCloseTo(1.375, 6);
  });

  it("enforces the per-bet cap", () => {
    const result = sizeBet({ probWin: 0.55, oddsAmerican: -110 }, DEFAULT_CONFIG);
    expect(result.recommendedUnits).toBe(DEFAULT_CONFIG.kelly.maxUnits);
  });

  it("returns nothing for a -EV bet", () => {
    const result = sizeBet({ probWin: 0.45, oddsAmerican: -110 }, DEFAULT_CONFIG);
    expect(result.kellyFractionRaw).toBe(0);
    expect(result.recommendedUnits).toBe(0);
    expect(result.bankrollFraction).toBe(0);
  });

  it("rounds a razor-thin edge down to zero", () => {
    const result = sizeBet(
      { probWin: 11 / 21 + 0.0001, oddsAmerican: -110 },
      DEFAULT_CONFIG,
    );
    expect(result.kellyFractionRaw).toBeGreaterThan(0);
    expect(result.recommendedUnits).toBe(0);
  });

  it("rounds to the configured increment", () => {
    const result = sizeBet(
      { probWin: 0.535, oddsAmerican: -110 },
      withConfig({ kelly: { maxUnits: 10, roundToUnits: 0.05 } }),
    );
    const steps = result.recommendedUnits / 0.05;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    expect(result.recommendedUnits).toBeCloseTo(0.6, 6);
  });
});

describe("unitsToStake", () => {
  it("converts units to currency at 1 unit = 1% of bankroll", () => {
    expect(unitsToStake(0.5, 10000, DEFAULT_CONFIG)).toBeCloseTo(50, 10);
    expect(unitsToStake(2, 5000, DEFAULT_CONFIG)).toBeCloseTo(100, 10);
  });
});
