/**
 * The model's record on its own recommended plays ("favorites"), season to
 * date — a running W-L/units/ROI scoreboard, not the drift check `monitor.ts`
 * does. `buildCalibrationMonitor` grades the same underlying data but is
 * deliberately capped to `GRADE_LOOKBACK_WEEKS` (a recent-drift tripwire);
 * this has no such cap — it folds in every graded week of the season.
 *
 * Reuses the exact grading/bucketing `src/lib/backtest/index.ts` already uses
 * for the historical replay (`grade`, `profit`, `bucketise`) rather than
 * re-deriving win/loss/units math a second time.
 */

import { bucketise, grade, profit, type Bucket, type GradedBet } from "../backtest";
import type { SlateSnapshot } from "../pipeline/types";

export interface SeasonRecord {
  season: number;
  /** Weeks folded in, ascending — only ones with at least one graded prop. */
  weeks: number[];
  /** False if any included week priced against synthetic (non-real) lines. */
  propsAreReal: boolean;
  record: Bucket;
}

/**
 * `snapshots` should be every stored slate for `season` that might be graded
 * (the caller decides which weeks to load) — snapshots with no actuals yet
 * are skipped here, same guard `buildCalibrationMonitor` uses. Returns `null`
 * when nothing has graded yet, so a caller can omit the field entirely
 * rather than render an empty 0-0 record before Week 1 finishes.
 */
export function buildSeasonRecord(
  snapshots: readonly SlateSnapshot[],
  season: number,
): SeasonRecord | null {
  const bets: GradedBet[] = [];
  const weeks: number[] = [];
  let propsAreReal = true;

  for (const snapshot of snapshots) {
    if (snapshot.season !== season) continue;
    if (snapshot.actuals.length === 0) continue;

    weeks.push(snapshot.week);
    if (!snapshot.propsAreReal) propsAreReal = false;

    const actualByProp = new Map<string, number>();
    for (const actual of snapshot.actuals) {
      if (actual.actualValue != null) actualByProp.set(actual.propId, actual.actualValue);
    }
    const nameById = new Map(snapshot.players.map((p) => [p.playerId, p.name]));

    for (const candidate of snapshot.recommendations) {
      const actual = actualByProp.get(candidate.propId);
      if (actual == null) continue;

      const outcome = grade(candidate.side, candidate.lineValue, actual);
      bets.push({
        season: snapshot.season,
        week: snapshot.week,
        propId: candidate.propId,
        playerId: candidate.playerId,
        playerName: nameById.get(candidate.playerId) ?? candidate.playerId,
        gameId: candidate.gameId,
        propType: candidate.propType,
        side: candidate.side,
        lineValue: candidate.lineValue,
        oddsAmerican: candidate.oddsAmerican,
        units: candidate.kelly.recommendedUnits,
        edge: candidate.edge,
        modelProb: candidate.modelProb,
        fairProb: candidate.fairProb,
        actualValue: actual,
        outcome,
        profitUnits: profit(outcome, candidate.kelly.recommendedUnits, candidate.oddsAmerican),
      });
    }
  }

  if (bets.length === 0) return null;

  weeks.sort((a, b) => a - b);

  return {
    season,
    weeks: [...new Set(weeks)],
    propsAreReal,
    record: bucketise("season", bets),
  };
}
