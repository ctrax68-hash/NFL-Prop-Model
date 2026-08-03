import { describe, expect, it } from "vitest";

import {
  computeOverUnder,
  estimateSigma,
  leagueSigma,
  negBinomialCdf,
  negBinomialParams,
  negBinomialPmf,
  poissonCdf,
  poissonPmf,
  solveTruncatedNormalLocation,
  truncatedNormalMean,
} from "./distribution";
import { DEFAULT_CONFIG, withConfig } from "./config";

describe("poisson", () => {
  it("matches hand-computed values", () => {
    // P(X = 2 | lambda = 3) = e^-3 * 3^2 / 2!
    expect(poissonPmf(2, 3)).toBeCloseTo((Math.exp(-3) * 9) / 2, 14);
    // P(X <= 2 | lambda = 3) = e^-3 * (1 + 3 + 4.5)
    expect(poissonCdf(2, 3)).toBeCloseTo(Math.exp(-3) * 8.5, 14);
  });

  it("sums to 1", () => {
    expect(poissonCdf(200, 5)).toBeCloseTo(1, 12);
  });
});

describe("negative binomial", () => {
  it("recovers the requested mean and variance", () => {
    const mu = 5;
    const variance = 7;
    const { r, p } = negBinomialParams(mu, variance);

    expect(r).toBeCloseTo(12.5, 12);
    expect(p).toBeCloseTo(5 / 7, 12);

    // mean = r(1-p)/p, var = r(1-p)/p^2
    expect((r * (1 - p)) / p).toBeCloseTo(mu, 12);
    expect((r * (1 - p)) / (p * p)).toBeCloseTo(variance, 12);
  });

  it("has a pmf that sums to 1", () => {
    const { r, p } = negBinomialParams(5, 7);
    expect(negBinomialCdf(300, r, p)).toBeCloseTo(1, 12);
  });

  it("empirically reproduces its mean and variance", () => {
    const { r, p } = negBinomialParams(6, 9);
    let mean = 0;
    let second = 0;
    for (let k = 0; k <= 400; k += 1) {
      const pmf = negBinomialPmf(k, r, p);
      mean += k * pmf;
      second += k * k * pmf;
    }
    expect(mean).toBeCloseTo(6, 8);
    expect(second - mean * mean).toBeCloseTo(9, 7);
  });

  it("is more dispersed than a Poisson with the same mean", () => {
    const { r, p } = negBinomialParams(5, 9);
    // Heavier right tail than Poisson: P(X > 10) is larger.
    expect(1 - negBinomialCdf(10, r, p)).toBeGreaterThan(1 - poissonCdf(10, 5));
  });
});

describe("truncated normal", () => {
  it("has a mean above its location parameter", () => {
    expect(truncatedNormalMean(20, 25)).toBeGreaterThan(20);
  });

  it("solves for the location that yields the target mean", () => {
    for (const [target, sigma] of [
      [60, 25],
      [25, 22],
      [8, 12],
      [3, 9],
      [150, 40],
    ] as const) {
      const location = solveTruncatedNormalLocation(target, sigma);
      expect(truncatedNormalMean(location, sigma)).toBeCloseTo(target, 6);
    }
  });

  it("barely shifts the location when the mean is many sigma above zero", () => {
    const location = solveTruncatedNormalLocation(300, 40);
    expect(location).toBeCloseTo(300, 4);
  });
});

describe("computeOverUnder — continuous stats", () => {
  it("returns complementary probabilities on a half-point line", () => {
    const result = computeOverUnder(
      { stat: "receiving_yards", mean: 62, sigma: 26, line: 54.5 },
      DEFAULT_CONFIG,
    );
    expect(result.probPush).toBe(0);
    expect(result.probOver + result.probUnder).toBeCloseTo(1, 12);
    expect(result.probOver).toBeGreaterThan(0.5);
  });

  it("prices a line at the projection near 50%", () => {
    const result = computeOverUnder(
      { stat: "receiving_yards", mean: 54.5, sigma: 26, line: 54.5 },
      withConfig({ distribution: { yards: "normal" } }),
    );
    expect(result.probOver).toBeCloseTo(0.5, 12);
  });

  it("keeps all mass at or above zero when truncating", () => {
    // A 20-yard projection with sigma 24 would put ~20% of an untruncated
    // normal below zero, which is impossible.
    const truncated = computeOverUnder(
      { stat: "receiving_yards", mean: 20, sigma: 24, line: 0.5 },
      withConfig({ distribution: { yards: "truncated-normal" } }),
    );
    const plain = computeOverUnder(
      { stat: "receiving_yards", mean: 20, sigma: 24, line: 0.5 },
      withConfig({ distribution: { yards: "normal" } }),
    );
    expect(truncated.probOver).toBeGreaterThan(plain.probOver);
    expect(truncated.probUnder).toBeLessThan(plain.probUnder);
  });

  it("preserves the projection as the distribution mean under truncation", () => {
    const sigma = 24;
    const mean = 20;
    const location = solveTruncatedNormalLocation(mean, sigma);
    expect(truncatedNormalMean(location, sigma)).toBeCloseTo(mean, 6);
  });

  it("allows a push on an integer yardage line", () => {
    const result = computeOverUnder(
      { stat: "receiving_yards", mean: 55, sigma: 25, line: 55 },
      DEFAULT_CONFIG,
    );
    expect(result.probPush).toBeGreaterThan(0);
    expect(result.probOver + result.probUnder + result.probPush).toBeCloseTo(1, 10);
  });
});

describe("computeOverUnder — count stats", () => {
  it("returns complementary probabilities on a half-point line", () => {
    const result = computeOverUnder(
      { stat: "receptions", mean: 5.2, sigma: 2.4, line: 4.5 },
      DEFAULT_CONFIG,
    );
    expect(result.probPush).toBe(0);
    expect(result.probOver + result.probUnder).toBeCloseTo(1, 12);
    expect(result.distribution).toBe("negative-binomial");
  });

  it("splits over/under at the right integer boundary", () => {
    // A 4.5 line means over needs 5+, under needs 4 or fewer.
    const { r, p } = negBinomialParams(5.2, 2.4 * 2.4);
    const result = computeOverUnder(
      { stat: "receptions", mean: 5.2, sigma: 2.4, line: 4.5 },
      DEFAULT_CONFIG,
    );
    expect(result.probUnder).toBeCloseTo(negBinomialCdf(4, r, p), 12);
  });

  it("carves out push probability on an integer line", () => {
    const result = computeOverUnder(
      { stat: "receptions", mean: 5.2, sigma: 2.4, line: 5 },
      DEFAULT_CONFIG,
    );
    const { r, p } = negBinomialParams(5.2, 2.4 * 2.4);

    expect(result.probPush).toBeCloseTo(negBinomialPmf(5, r, p), 12);
    expect(result.probPush).toBeGreaterThan(0.1);
    expect(result.probOver + result.probUnder + result.probPush).toBeCloseTo(1, 10);
    // The two sides must NOT sum to 1 here — that is the whole point.
    expect(result.probOver + result.probUnder).toBeLessThan(0.95);
  });

  it("falls back to Poisson when the data is underdispersed", () => {
    // variance < mean makes the negative binomial undefined.
    const result = computeOverUnder(
      { stat: "receptions", mean: 6, sigma: 1.5, line: 5.5 },
      DEFAULT_CONFIG,
    );
    expect(result.distribution).toBe("poisson");
    expect(result.probOver + result.probUnder).toBeCloseTo(1, 12);
  });

  it("honours a config override forcing the normal approximation", () => {
    const result = computeOverUnder(
      { stat: "receptions", mean: 5.2, sigma: 2.4, line: 4.5 },
      withConfig({ distribution: { counts: "normal" } }),
    );
    expect(result.distribution).toContain("normal");
  });
});

describe("estimateSigma", () => {
  const config = DEFAULT_CONFIG;

  it("uses the league model when the player has no history", () => {
    const sigma = estimateSigma(
      { stat: "receiving_yards", projectedMean: 60, playerGames: 0 },
      config,
    );
    expect(sigma).toBeCloseTo(
      leagueSigma(config.distribution.sigmaModels.receiving_yards, 60),
      12,
    );
  });

  it("shrinks a thin sample toward the league model", () => {
    const league = leagueSigma(
      config.distribution.sigmaModels.receiving_yards,
      60,
    );
    const shrunk = estimateSigma(
      {
        stat: "receiving_yards",
        projectedMean: 60,
        playerSigma: league * 2,
        playerMean: 60,
        playerGames: 2,
      },
      config,
    );
    // With k = 8, two games carry 2/10 of the weight.
    expect(shrunk).toBeCloseTo(0.2 * league * 2 + 0.8 * league, 8);
  });

  it("leans on the player's own sigma once the sample is large", () => {
    const league = leagueSigma(
      config.distribution.sigmaModels.receiving_yards,
      60,
    );
    const shrunk = estimateSigma(
      {
        stat: "receiving_yards",
        projectedMean: 60,
        playerSigma: league * 2,
        playerMean: 60,
        playerGames: 72,
      },
      config,
    );
    expect(shrunk).toBeGreaterThan(league * 1.8);
  });

  it("scales a player's sigma to the projected volume", () => {
    // Same player sigma, but projected for far more volume than they averaged.
    const lowVolume = estimateSigma(
      {
        stat: "receiving_yards",
        projectedMean: 30,
        playerSigma: 20,
        playerMean: 30,
        playerGames: 10,
      },
      config,
    );
    const highVolume = estimateSigma(
      {
        stat: "receiving_yards",
        projectedMean: 90,
        playerSigma: 20,
        playerMean: 30,
        playerGames: 10,
      },
      config,
    );
    expect(highVolume).toBeGreaterThan(lowVolume);
  });

  it("never returns less than the configured floor", () => {
    const sigma = estimateSigma(
      {
        stat: "receptions",
        projectedMean: 0,
        playerSigma: 0.0001,
        playerMean: 0.1,
        playerGames: 50,
      },
      config,
    );
    expect(sigma).toBeGreaterThanOrEqual(
      config.distribution.sigmaModels.receptions.min,
    );
  });
});
