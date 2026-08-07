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
  gammaParams,
  gammaCdf,
  gammaPdf,
} from "./distribution";
import { DEFAULT_CONFIG, withConfig } from "./config";

/** Numeric mean of a continuous density, for checking moment matching. */
function numericMean(
  pdf: (x: number) => number,
  hi: number,
  steps = 200_000,
): number {
  const step = hi / steps;
  let total = 0;
  for (let i = 0; i < steps; i += 1) {
    const x = (i + 0.5) * step;
    total += x * pdf(x) * step;
  }
  return total;
}

describe("gamma", () => {
  it("matches the requested mean and variance exactly", () => {
    for (const [mean, sigma] of [
      [32, 23],
      [5, 4],
      [250, 70],
    ]) {
      const { shape, scale } = gammaParams(mean, sigma);
      expect(shape * scale).toBeCloseTo(mean, 9);
      expect(Math.sqrt(shape * scale * scale)).toBeCloseTo(sigma, 9);
    }
  });

  it("integrates to the same mean its parameters claim", () => {
    const { shape, scale } = gammaParams(32, 23);
    expect(numericMean((x) => gammaPdf(x, shape, scale), 400)).toBeCloseTo(
      32,
      2,
    );
  });

  it("has a CDF that is monotone, bounded, and zero at the origin", () => {
    const { shape, scale } = gammaParams(32, 23);
    expect(gammaCdf(0, shape, scale)).toBe(0);
    let previous = -1;
    for (let x = 0; x <= 400; x += 2) {
      const value = gammaCdf(x, shape, scale);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(gammaCdf(1e6, shape, scale)).toBeCloseTo(1, 10);
  });

  it("places its median below its mean — the property the truncated normal lacked", () => {
    // Right skew is the entire point of the family swap: the old model put the
    // median at ~0.97x the mean for these parameters, reality nearer 0.83x.
    const mean = 32;
    const { shape, scale } = gammaParams(mean, 23);
    let lo = 0;
    let hi = 400;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      if (gammaCdf(mid, shape, scale) < 0.5) lo = mid;
      else hi = mid;
    }
    const median = (lo + hi) / 2;
    expect(median).toBeLessThan(mean);
    expect(median / mean).toBeGreaterThan(0.7);
    expect(median / mean).toBeLessThan(0.9);
  });
});

describe("computeOverUnder — gamma yards", () => {
  const gammaConfig = withConfig({
    distribution: {
      yards: { receiving_yards: "gamma", rushing_yards: "gamma" },
    },
  });

  it("labels the distribution it actually used", () => {
    const result = computeOverUnder(
      { stat: "receiving_yards", mean: 32, sigma: 23, line: 31.5 },
      gammaConfig,
    );
    expect(result.distribution).toBe("gamma");
  });

  it("prices the over below 50% at a line on the mean, because the median is lower", () => {
    const result = computeOverUnder(
      { stat: "receiving_yards", mean: 32, sigma: 23, line: 32.5 },
      gammaConfig,
    );
    expect(result.probOver).toBeLessThan(0.5);
    expect(result.probOver + result.probUnder + result.probPush).toBeCloseTo(
      1,
      10,
    );
  });

  it("keeps probabilities summing to one on integer lines, where a push is live", () => {
    const result = computeOverUnder(
      { stat: "rushing_yards", mean: 40, sigma: 25, line: 40 },
      gammaConfig,
    );
    expect(result.probPush).toBeGreaterThan(0);
    expect(result.probOver + result.probUnder + result.probPush).toBeCloseTo(
      1,
      10,
    );
  });

  it("degenerates safely at a zero projection instead of dividing by it", () => {
    const result = computeOverUnder(
      { stat: "receiving_yards", mean: 0, sigma: 10, line: 10.5 },
      gammaConfig,
    );
    expect(result.probOver).toBe(0);
    expect(result.probUnder).toBe(1);
    expect(Number.isNaN(result.probOver)).toBe(false);
  });

  it("is monotone decreasing in the line", () => {
    let previous = 1;
    for (let line = 0.5; line < 200; line += 5) {
      const { probOver } = computeOverUnder(
        { stat: "receiving_yards", mean: 32, sigma: 23, line },
        gammaConfig,
      );
      expect(probOver).toBeLessThanOrEqual(previous + 1e-12);
      previous = probOver;
    }
  });
});

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
      withConfig({
        distribution: {
          yards: { receiving_yards: "normal", rushing_yards: "normal", passing_yards: "normal" },
        },
      }),
    );
    expect(result.probOver).toBeCloseTo(0.5, 12);
  });

  it("keeps all mass at or above zero when truncating", () => {
    // A 20-yard projection with sigma 24 would put ~20% of an untruncated
    // normal below zero, which is impossible.
    const truncated = computeOverUnder(
      { stat: "receiving_yards", mean: 20, sigma: 24, line: 0.5 },
      withConfig({
        distribution: {
          yards: { receiving_yards: "truncated-normal", rushing_yards: "truncated-normal", passing_yards: "truncated-normal" },
        },
      }),
    );
    const plain = computeOverUnder(
      { stat: "receiving_yards", mean: 20, sigma: 24, line: 0.5 },
      withConfig({
        distribution: {
          yards: { receiving_yards: "normal", rushing_yards: "normal", passing_yards: "normal" },
        },
      }),
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
