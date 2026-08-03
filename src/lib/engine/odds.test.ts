import { describe, expect, it } from "vitest";

import {
  americanToDecimal,
  americanToImpliedProb,
  decimalToAmerican,
  devig,
  expectedValue,
  impliedProbToAmerican,
  profitMultiple,
} from "./odds";

describe("americanToImpliedProb", () => {
  it("matches the spec's worked examples", () => {
    // -115 -> 115 / 215
    expect(americanToImpliedProb(-115)).toBeCloseTo(0.534883720930233, 12);
    // +120 -> 100 / 220
    expect(americanToImpliedProb(120)).toBeCloseTo(0.454545454545455, 12);
  });

  it("prices an even-money bet at 50%", () => {
    expect(americanToImpliedProb(100)).toBeCloseTo(0.5, 12);
    expect(americanToImpliedProb(-100)).toBeCloseTo(0.5, 12);
  });

  it("rejects zero and non-finite odds", () => {
    expect(() => americanToImpliedProb(0)).toThrow();
    expect(() => americanToImpliedProb(Number.NaN)).toThrow();
  });
});

describe("americanToDecimal", () => {
  it("converts negative odds", () => {
    expect(americanToDecimal(-115)).toBeCloseTo(1.869565217391304, 12);
    expect(americanToDecimal(-110)).toBeCloseTo(1.909090909090909, 12);
  });

  it("converts positive odds", () => {
    expect(americanToDecimal(120)).toBeCloseTo(2.2, 12);
    expect(americanToDecimal(250)).toBeCloseTo(3.5, 12);
  });

  it("round-trips through decimalToAmerican", () => {
    for (const odds of [-300, -175, -110, 100, 145, 400]) {
      expect(decimalToAmerican(americanToDecimal(odds))).toBeCloseTo(odds, 9);
    }
  });

  it("round-trips through impliedProbToAmerican", () => {
    for (const odds of [-250, -110, 105, 320]) {
      expect(impliedProbToAmerican(americanToImpliedProb(odds))).toBeCloseTo(
        odds,
        9,
      );
    }
  });
});

describe("profitMultiple", () => {
  it("is the net win per unit staked", () => {
    expect(profitMultiple(100)).toBeCloseTo(1, 12);
    expect(profitMultiple(-110)).toBeCloseTo(0.909090909090909, 12);
    expect(profitMultiple(150)).toBeCloseTo(1.5, 12);
  });
});

describe("devig", () => {
  it("reports the overround on a standard -110/-110 market", () => {
    const result = devig(-110, -110, "multiplicative");
    // Each side implies 11/21; the pair sums to 22/21 ~ 1.0476.
    expect(result.overround).toBeCloseTo(1.047619047619048, 12);
    expect(result.rawProbOver).toBeCloseTo(0.523809523809524, 12);
  });

  it("returns fair probabilities summing to exactly 1", () => {
    for (const method of ["multiplicative", "power"] as const) {
      const result = devig(-125, 105, method);
      expect(result.fairProbOver + result.fairProbUnder).toBeCloseTo(1, 10);
    }
  });

  it("splits a symmetric market evenly", () => {
    const result = devig(-110, -110, "multiplicative");
    expect(result.fairProbOver).toBeCloseTo(0.5, 12);
    expect(result.fairProbUnder).toBeCloseTo(0.5, 12);
  });

  it("power method solves p^k + q^k = 1", () => {
    const result = devig(-140, 115, "power");
    expect(result.fairProbOver + result.fairProbUnder).toBeCloseTo(1, 10);
    // Fair probability sits below the vig-inclusive number on both sides.
    expect(result.fairProbOver).toBeLessThan(result.rawProbOver);
    expect(result.fairProbUnder).toBeLessThan(result.rawProbUnder);
  });

  it("passes raw probabilities through when disabled", () => {
    const result = devig(-115, -105, "none");
    expect(result.fairProbOver).toBeCloseTo(result.rawProbOver, 12);
    expect(result.fairProbOver + result.fairProbUnder).toBeGreaterThan(1);
  });

  it("removes the bias that makes both sides look -EV", () => {
    // With a true 50/50 market priced -110/-110, comparing against the raw
    // implied probability shows a negative edge on both sides. This is the
    // failure mode de-vigging exists to prevent.
    const raw = devig(-110, -110, "none");
    expect(0.5 - raw.rawProbOver).toBeLessThan(0);
    expect(0.5 - raw.rawProbUnder).toBeLessThan(0);

    const fair = devig(-110, -110, "multiplicative");
    expect(0.5 - fair.fairProbOver).toBeCloseTo(0, 12);
  });
});

describe("expectedValue", () => {
  it("is zero at the break-even probability", () => {
    // -110 breaks even at 11/21 of the time.
    expect(expectedValue(11 / 21, -110)).toBeCloseTo(0, 12);
  });

  it("is positive above break-even", () => {
    expect(expectedValue(0.56, -110)).toBeGreaterThan(0);
  });

  it("treats a push as a stake refund, not a loss", () => {
    // 40% win / 20% push / 40% lose at +100 is +EV: 0.4 - 0.4 = 0.
    expect(expectedValue(0.4, 100, 0.2)).toBeCloseTo(0, 12);
    expect(expectedValue(0.45, 100, 0.2)).toBeCloseTo(0.1, 12);
  });
});
