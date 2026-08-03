import { describe, expect, it } from "vitest";

import { impliedTeamTotals, projectTeamPlays } from "./plays";
import { projectPassRushSplit } from "./gameScript";
import { normaliseShares, projectPlayerVolume } from "./volume";
import {
  adjustEfficiency,
  defenseMultiplier,
  passingWeatherMultiplier,
  zScore,
} from "./efficiency";
import { DEFAULT_CONFIG, withConfig } from "./config";

describe("projectTeamPlays", () => {
  it("averages the two paces at league-average total and spread", () => {
    const plays = projectTeamPlays(
      { teamPace: 65, oppPace: 61, total: 44.5, absSpread: 5.5 },
      DEFAULT_CONFIG,
    );
    expect(plays).toBeCloseTo(63, 10);
  });

  it("adds plays for a high total", () => {
    const plays = projectTeamPlays(
      { teamPace: 65, oppPace: 61, total: 50.5, absSpread: 5.5 },
      DEFAULT_CONFIG,
    );
    // 63 + 6 * 0.35
    expect(plays).toBeCloseTo(65.1, 10);
  });

  it("removes plays for a likely blowout", () => {
    const plays = projectTeamPlays(
      { teamPace: 65, oppPace: 61, total: 44.5, absSpread: 13.5 },
      DEFAULT_CONFIG,
    );
    // 63 - 8 * 0.15
    expect(plays).toBeCloseTo(61.8, 10);
  });

  it("clamps to a plausible range", () => {
    const absurd = projectTeamPlays(
      { teamPace: 120, oppPace: 120, total: 80, absSpread: 0 },
      DEFAULT_CONFIG,
    );
    expect(absurd).toBe(DEFAULT_CONFIG.plays.maxPlays);
  });
});

describe("impliedTeamTotals", () => {
  it("splits the total by the spread", () => {
    // Home favoured by 7 in a 47-point game: 27 / 20.
    const { home, away } = impliedTeamTotals(47, -7);
    expect(home).toBeCloseTo(27, 10);
    expect(away).toBeCloseTo(20, 10);
    expect(home + away).toBeCloseTo(47, 10);
  });

  it("splits evenly at a pick'em", () => {
    const { home, away } = impliedTeamTotals(44, 0);
    expect(home).toBeCloseTo(22, 10);
    expect(away).toBeCloseTo(22, 10);
  });
});

describe("projectPassRushSplit", () => {
  const baseline = {
    projectedPlays: 63,
    passRateOverall: 0.58,
    passRateWhenLeading: 0.52,
    passRateWhenTrailing: 0.65,
  };

  it("uses the overall rate at a pick'em", () => {
    const split = projectPassRushSplit(
      { ...baseline, spread: 0 },
      DEFAULT_CONFIG,
    );
    expect(split.passRate).toBeCloseTo(0.58, 10);
  });

  it("shifts toward the leading rate for a big favourite", () => {
    const split = projectPassRushSplit(
      { ...baseline, spread: -10 },
      DEFAULT_CONFIG,
    );
    expect(split.passRate).toBeCloseTo(0.52, 10);
  });

  it("shifts toward the trailing rate for a big underdog", () => {
    const split = projectPassRushSplit(
      { ...baseline, spread: 10 },
      DEFAULT_CONFIG,
    );
    expect(split.passRate).toBeCloseTo(0.65, 10);
  });

  it("interpolates linearly rather than stepping at a threshold", () => {
    const atSix = projectPassRushSplit(
      { ...baseline, spread: -6 },
      DEFAULT_CONFIG,
    ).passRate;
    const atSixHalf = projectPassRushSplit(
      { ...baseline, spread: -6.5 },
      DEFAULT_CONFIG,
    ).passRate;

    // The spec's hard +/-6 rule would jump here; interpolation must not.
    expect(Math.abs(atSix - atSixHalf)).toBeLessThan(0.005);
    expect(atSixHalf).toBeLessThan(atSix);
  });

  it("caps how far game script may move the pass rate", () => {
    const split = projectPassRushSplit(
      {
        ...baseline,
        passRateWhenLeading: 0.3,
        spread: -10,
      },
      DEFAULT_CONFIG,
    );
    // Raw shift would be -0.28; the cap is 0.08.
    expect(split.passRate).toBeCloseTo(0.58 - 0.08, 10);
  });

  it("splits plays into attempts, net of sacks", () => {
    const split = projectPassRushSplit(
      { ...baseline, spread: 0 },
      DEFAULT_CONFIG,
    );
    expect(split.projectedDropbacks).toBeCloseTo(63 * 0.58, 10);
    expect(split.projectedPassAttempts).toBeCloseTo(63 * 0.58 * 0.935, 10);
    expect(split.projectedRushAttempts).toBeCloseTo(63 * 0.42, 10);
    // Dropbacks and rushes must account for every play.
    expect(split.projectedDropbacks + split.projectedRushAttempts).toBeCloseTo(
      63,
      10,
    );
  });
});

describe("projectPlayerVolume", () => {
  it("multiplies team volume by player share", () => {
    const volume = projectPlayerVolume({
      projectedTeamTargets: 34,
      projectedTeamPassAttempts: 36,
      projectedRushAttempts: 26,
      baselineTargetShare: 0.25,
      baselineRushShare: 0.6,
      baselinePassAttemptShare: 0,
    });
    expect(volume.projectedTargets).toBeCloseTo(8.5, 10);
    expect(volume.projectedCarries).toBeCloseTo(15.6, 10);
    expect(volume.projectedPlayerPassAttempts).toBe(0);
  });

  it("gives a starting quarterback nearly all the team's attempts", () => {
    const volume = projectPlayerVolume({
      projectedTeamTargets: 34,
      projectedTeamPassAttempts: 36,
      projectedRushAttempts: 26,
      baselineTargetShare: 0,
      baselineRushShare: 0.08,
      baselinePassAttemptShare: 0.97,
    });
    expect(volume.projectedPlayerPassAttempts).toBeCloseTo(34.92, 10);
  });
});

describe("normaliseShares", () => {
  it("rescales shares to sum to 1", () => {
    const result = normaliseShares([
      { playerId: "a", share: 0.2 },
      { playerId: "b", share: 0.3 },
      { playerId: "c", share: 0.3 },
    ]);
    const total = [...result.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(result.get("a")).toBeCloseTo(0.25, 12);
  });

  it("preserves relative ordering", () => {
    const result = normaliseShares([
      { playerId: "a", share: 0.1 },
      { playerId: "b", share: 0.4 },
    ]);
    expect(result.get("b")!).toBeGreaterThan(result.get("a")!);
  });

  it("returns zeros rather than dividing by zero", () => {
    const result = normaliseShares([
      { playerId: "a", share: 0 },
      { playerId: "b", share: 0 },
    ]);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });
});

describe("defenseMultiplier", () => {
  it("is neutral against an average defense", () => {
    expect(defenseMultiplier(0, DEFAULT_CONFIG)).toBeCloseTo(1, 12);
  });

  it("boosts efficiency against a generous defense", () => {
    expect(defenseMultiplier(2, DEFAULT_CONFIG)).toBeCloseTo(1.1, 12);
  });

  it("suppresses efficiency against a stingy defense", () => {
    expect(defenseMultiplier(-2, DEFAULT_CONFIG)).toBeCloseTo(0.9, 12);
  });

  it("clamps extreme opponents", () => {
    expect(defenseMultiplier(10, DEFAULT_CONFIG)).toBeCloseTo(1.15, 12);
    expect(defenseMultiplier(-10, DEFAULT_CONFIG)).toBeCloseTo(0.85, 12);
  });
});

describe("zScore", () => {
  it("standardises against league norms", () => {
    expect(zScore(8.5, { mean: 7.5, sd: 0.5 })).toBeCloseTo(2, 12);
  });

  it("returns zero when the norm has no spread", () => {
    expect(zScore(8.5, { mean: 7.5, sd: 0 })).toBe(0);
  });
});

describe("passingWeatherMultiplier", () => {
  it("is neutral indoors", () => {
    expect(
      passingWeatherMultiplier(
        { weatherType: "dome", windSpeedMph: 40 },
        DEFAULT_CONFIG,
      ),
    ).toBe(1);
  });

  it("is neutral outdoors in calm conditions", () => {
    expect(
      passingWeatherMultiplier(
        { weatherType: "outdoors", windSpeedMph: 5 },
        DEFAULT_CONFIG,
      ),
    ).toBeCloseTo(1, 12);
  });

  it("penalises high wind", () => {
    // 22 mph is 10 above the threshold: 10 * 0.006 = 6%.
    expect(
      passingWeatherMultiplier(
        { weatherType: "outdoors", windSpeedMph: 22 },
        DEFAULT_CONFIG,
      ),
    ).toBeCloseTo(0.94, 12);
  });

  it("adds a penalty for precipitation", () => {
    expect(
      passingWeatherMultiplier(
        { weatherType: "snow", windSpeedMph: 22 },
        DEFAULT_CONFIG,
      ),
    ).toBeCloseTo(0.91, 12);
  });

  it("caps the total weather penalty", () => {
    expect(
      passingWeatherMultiplier(
        { weatherType: "snow", windSpeedMph: 90 },
        DEFAULT_CONFIG,
      ),
    ).toBeCloseTo(1 - DEFAULT_CONFIG.efficiency.maxWeatherPenalty, 12);
  });

  it("treats missing wind data as calm rather than failing", () => {
    expect(
      passingWeatherMultiplier(
        { weatherType: "outdoors", windSpeedMph: null },
        DEFAULT_CONFIG,
      ),
    ).toBeCloseTo(1, 12);
  });
});

describe("adjustEfficiency", () => {
  const input = {
    baselineYardsPerTarget: 8.5,
    baselineYardsPerCarry: 4.4,
    baselineCatchRate: 0.68,
    baselineYardsPerPassAttempt: 7.2,
    baselineCompletionRate: 0.66,
    receivingDefenseZ: 0,
    rushingDefenseZ: 0,
    passingDefenseZ: 0,
    passingWeatherMultiplier: 1,
  };

  it("passes baselines through in neutral conditions", () => {
    const out = adjustEfficiency(input, DEFAULT_CONFIG);
    expect(out.yardsPerTarget).toBeCloseTo(8.5, 12);
    expect(out.yardsPerCarry).toBeCloseTo(4.4, 12);
    expect(out.catchRate).toBeCloseTo(0.68, 12);
  });

  it("moves yardage more than catch rate in bad weather", () => {
    const out = adjustEfficiency(
      { ...input, passingWeatherMultiplier: 0.9 },
      DEFAULT_CONFIG,
    );
    const yardsDrop = 1 - out.yardsPerTarget / 8.5;
    const catchDrop = 1 - out.catchRate / 0.68;
    expect(yardsDrop).toBeCloseTo(0.1, 10);
    expect(catchDrop).toBeCloseTo(0.1 / 3, 10);
  });

  it("leaves rushing untouched by weather", () => {
    const out = adjustEfficiency(
      { ...input, passingWeatherMultiplier: 0.85 },
      DEFAULT_CONFIG,
    );
    expect(out.yardsPerCarry).toBeCloseTo(4.4, 12);
  });

  it("respects a disabled defensive adjustment", () => {
    const out = adjustEfficiency(
      { ...input, receivingDefenseZ: 3 },
      withConfig({ efficiency: { defenseWeight: 0 } }),
    );
    expect(out.yardsPerTarget).toBeCloseTo(8.5, 12);
  });
});
