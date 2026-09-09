import { describe, expect, it } from "vitest";

import { applyInjuryAdjustments } from "./run";
import { DEFAULT_CONFIG, withConfig } from "../engine/config";
import type { InjuryStatus, PlayerBaseline } from "../engine/types";
import type { PlayerRecord } from "../ingest/baselines";

function record(
  playerId: string,
  overrides: Partial<PlayerBaseline> & { injuryStatus?: InjuryStatus } = {},
): PlayerRecord {
  const baseline: PlayerBaseline = {
    playerId,
    name: playerId,
    teamId: "KC",
    position: "WR",
    baselineTargetShare: 0.2,
    baselineRushShare: 0,
    baselineRouteParticipation: 0.8,
    baselineSnapShare: 0.8,
    baselineYardsPerTarget: 8,
    baselineYardsPerCarry: 4,
    baselineCatchRate: 0.65,
    baselineReceptionsPerGame: 5,
    baselineCarriesPerGame: 0,
    baselinePassAttemptShare: 0,
    baselineYardsPerPassAttempt: 7,
    baselineCompletionRate: 0.65,
    gamesSampleN: 10,
    ...overrides,
  };
  return {
    baseline,
    headshotUrl: null,
    statHistory: {},
    lastSeen: { season: 2025, week: 10 },
  };
}

describe("applyInjuryAdjustments", () => {
  it("passes a healthy player through unchanged", () => {
    const records = new Map([["p1", record("p1")]]);
    const out = applyInjuryAdjustments(records, DEFAULT_CONFIG);
    expect(out.get("p1")).toBe(records.get("p1"));
  });

  it("excludes a player ruled Out entirely", () => {
    const records = new Map([["p1", record("p1", { injuryStatus: "out" })]]);
    const out = applyInjuryAdjustments(records, DEFAULT_CONFIG);
    expect(out.has("p1")).toBe(false);
  });

  it("leaves shares unchanged when the multiplier is 1 (the shipped default)", () => {
    const records = new Map([
      ["p1", record("p1", { injuryStatus: "questionable" })],
    ]);
    const out = applyInjuryAdjustments(records, DEFAULT_CONFIG);
    expect(out.get("p1")?.baseline.baselineTargetShare).toBe(0.2);
  });

  it("haircuts a Questionable player's usage shares when configured", () => {
    const config = withConfig({ injury: { questionableVolumeMultiplier: 0.8 } });
    const records = new Map([
      [
        "p1",
        record("p1", {
          injuryStatus: "questionable",
          baselineTargetShare: 0.2,
          baselinePassAttemptShare: 0.9,
        }),
      ],
    ]);
    const out = applyInjuryAdjustments(records, config);
    const baseline = out.get("p1")!.baseline;
    expect(baseline.baselineTargetShare).toBeCloseTo(0.16);
    expect(baseline.baselinePassAttemptShare).toBeCloseTo(0.72);
  });

  it("haircuts a Doubtful player using the doubtful multiplier, not the questionable one", () => {
    const config = withConfig({
      injury: { questionableVolumeMultiplier: 0.8, doubtfulVolumeMultiplier: 0.5 },
    });
    const records = new Map([
      ["p1", record("p1", { injuryStatus: "doubtful", baselineTargetShare: 0.2 })],
    ]);
    const out = applyInjuryAdjustments(records, config);
    expect(out.get("p1")?.baseline.baselineTargetShare).toBeCloseTo(0.1);
  });
});
