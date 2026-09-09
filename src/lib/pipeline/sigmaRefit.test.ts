import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../engine/config";
import type { StatType } from "../engine/types";
import type { SigmaFitResult } from "../ingest/varianceModel";
import { withRefitSigma, SIGMA_REFIT_MIN_SAMPLE } from "./sigmaRefit";

const ASOF = { season: 2026, week: 5 };
const STATS = Object.keys(DEFAULT_CONFIG.distribution.sigmaModels) as StatType[];

function fit(overrides: Partial<Record<StatType, { intercept: number; slope: number; n: number }>>): SigmaFitResult {
  const models = { ...DEFAULT_CONFIG.distribution.sigmaModels };
  const sampleSizes = Object.fromEntries(STATS.map((s) => [s, 0])) as Record<StatType, number>;
  for (const [stat, o] of Object.entries(overrides) as Array<[StatType, { intercept: number; slope: number; n: number }]>) {
    models[stat] = { intercept: o.intercept, slope: o.slope, min: models[stat].min };
    sampleSizes[stat] = o.n;
  }
  return { models, sampleSizes };
}

describe("withRefitSigma", () => {
  const shipped = DEFAULT_CONFIG.distribution.sigmaModels.receiving_yards;

  it("applies a well-sampled fit and keeps the shipped minimum", () => {
    const { config, report } = withRefitSigma(
      DEFAULT_CONFIG,
      fit({ receiving_yards: { intercept: shipped.intercept * 1.1, slope: shipped.slope * 0.9, n: 400 } }),
      ASOF,
    );
    const applied = config.distribution.sigmaModels.receiving_yards;
    expect(applied.intercept).toBeCloseTo(shipped.intercept * 1.1, 3);
    expect(applied.slope).toBeCloseTo(shipped.slope * 0.9, 3);
    expect(applied.min).toBe(shipped.min);
    const entry = report.entries.find((e) => e.stat === "receiving_yards")!;
    expect(entry.clamped).toBe(false);
    expect(entry.sampleSize).toBe(400);
  });

  it("keeps the shipped model when the fit lacked sample", () => {
    const { config, report } = withRefitSigma(
      DEFAULT_CONFIG,
      fit({ receiving_yards: { intercept: 1, slope: 1, n: SIGMA_REFIT_MIN_SAMPLE - 1 } }),
      ASOF,
    );
    expect(config.distribution.sigmaModels.receiving_yards).toEqual(shipped);
    const entry = report.entries.find((e) => e.stat === "receiving_yards")!;
    expect(entry.fitted).toBeNull();
  });

  it("holds a runaway fit inside the band and says so", () => {
    const { config, report } = withRefitSigma(
      DEFAULT_CONFIG,
      fit({ receiving_yards: { intercept: shipped.intercept * 4, slope: shipped.slope / 10, n: 400 } }),
      ASOF,
    );
    const applied = config.distribution.sigmaModels.receiving_yards;
    expect(applied.intercept).toBeCloseTo(shipped.intercept * 1.5, 3);
    expect(applied.slope).toBeCloseTo(shipped.slope / 1.5, 3);
    expect(report.entries.find((e) => e.stat === "receiving_yards")!.clamped).toBe(true);
  });

  it("marks the config version so a run is distinguishable from a static one", () => {
    const { config } = withRefitSigma(DEFAULT_CONFIG, fit({}), ASOF);
    expect(config.configVersion).toBe(`${DEFAULT_CONFIG.configVersion}+sigma-refit`);
    expect(config.distribution.sigmaBlendK).toBe(DEFAULT_CONFIG.distribution.sigmaBlendK);
  });

  it("does not mutate the input config", () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    withRefitSigma(DEFAULT_CONFIG, fit({ receptions: { intercept: 9, slope: 0.1, n: 500 } }), ASOF);
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });
});
