/**
 * Step 10 of the spec: filter evaluated props down to bettable candidates,
 * then size them.
 */

import { sideOf, type PropEvaluation } from "./edge";
import { sizeBet, type KellyResult } from "./kelly";
import type { EngineConfig } from "./config";
import type { PropLine, Side } from "./types";

export interface BetCandidate {
  propId: string;
  playerId: string;
  gameId: string;
  propType: PropLine["propType"];
  lineValue: number;
  side: Side;

  edge: number;
  ev: number;
  modelProb: number;
  modelProbNoPush: number;
  fairProb: number;
  impliedProb: number;
  oddsAmerican: number;

  kelly: KellyResult;
}

export interface SelectionContext {
  /** Games of history behind each player's baselines, keyed by player id. */
  gamesSampleByPlayer: ReadonlyMap<string, number>;
}

export interface RejectedCandidate {
  propId: string;
  side: Side;
  reason: string;
}

export interface SelectionResult {
  selected: BetCandidate[];
  rejected: RejectedCandidate[];
}

/**
 * Apply the spec's filters, then the exposure caps.
 *
 * Each prop contributes at most one side: if the model thinks the over is
 * +EV, the under cannot also be, so taking both would only ever be a bookkeeping
 * error.
 */
export function selectBets(
  evaluations: readonly PropEvaluation[],
  propsById: ReadonlyMap<string, PropLine>,
  context: SelectionContext,
  config: EngineConfig,
): SelectionResult {
  const {
    minEdge,
    minGamesSample,
    maxOverround,
    minModelProb,
    maxModelProb,
    maxBetsPerGame,
    maxBetsPerPlayer,
  } = config.selection;

  const rejected: RejectedCandidate[] = [];
  const passed: BetCandidate[] = [];

  for (const evaluation of evaluations) {
    const prop = propsById.get(evaluation.propId);
    if (!prop) continue;

    // Pick the better side; the other cannot be +EV at the same time.
    const side: Side =
      evaluation.edgeOver >= evaluation.edgeUnder ? "over" : "under";
    const view = sideOf(evaluation, side);
    const oddsAmerican =
      side === "over" ? prop.oddsOverAmerican : prop.oddsUnderAmerican;

    const reject = (reason: string) => {
      rejected.push({ propId: evaluation.propId, side, reason });
    };

    if (evaluation.overround > maxOverround) {
      reject(`overround ${evaluation.overround.toFixed(3)} above ${maxOverround}`);
      continue;
    }

    const games = context.gamesSampleByPlayer.get(evaluation.playerId) ?? 0;
    if (games < minGamesSample) {
      reject(`only ${games} games of history, need ${minGamesSample}`);
      continue;
    }

    // A model probability pinned near 0 or 1 usually means a broken projection
    // or a stale line, not a 20% edge. Treat it as a data-quality signal.
    if (
      view.modelProbNoPush < minModelProb ||
      view.modelProbNoPush > maxModelProb
    ) {
      reject(
        `model probability ${view.modelProbNoPush.toFixed(3)} outside plausible range`,
      );
      continue;
    }

    if (view.edge < minEdge) {
      reject(`edge ${(view.edge * 100).toFixed(2)}% below ${(minEdge * 100).toFixed(2)}%`);
      continue;
    }

    const kelly = sizeBet(
      {
        probWin: view.modelProb,
        probPush: view.probPush,
        oddsAmerican,
      },
      config,
    );

    if (kelly.recommendedUnits <= 0) {
      reject("Kelly stake rounds to zero");
      continue;
    }

    passed.push({
      propId: evaluation.propId,
      playerId: evaluation.playerId,
      gameId: evaluation.gameId,
      propType: evaluation.propType,
      lineValue: evaluation.lineValue,
      side,
      edge: view.edge,
      ev: view.ev,
      modelProb: view.modelProb,
      modelProbNoPush: view.modelProbNoPush,
      fairProb: view.fairProb,
      impliedProb: view.rawImplied,
      oddsAmerican,
      kelly,
    });
  }

  passed.sort((a, b) => b.edge - a.edge);

  const perGame = new Map<string, number>();
  const perPlayer = new Map<string, number>();
  const selected: BetCandidate[] = [];

  for (const candidate of passed) {
    const gameCount = perGame.get(candidate.gameId) ?? 0;
    const playerCount = perPlayer.get(candidate.playerId) ?? 0;

    if (gameCount >= maxBetsPerGame) {
      rejected.push({
        propId: candidate.propId,
        side: candidate.side,
        reason: `game already at the ${maxBetsPerGame}-bet cap`,
      });
      continue;
    }

    if (playerCount >= maxBetsPerPlayer) {
      rejected.push({
        propId: candidate.propId,
        side: candidate.side,
        reason: `player already at the ${maxBetsPerPlayer}-bet cap`,
      });
      continue;
    }

    perGame.set(candidate.gameId, gameCount + 1);
    perPlayer.set(candidate.playerId, playerCount + 1);
    selected.push(candidate);
  }

  return { selected, rejected };
}

/** Total exposure of a slate, in units. */
export function totalUnits(candidates: readonly BetCandidate[]): number {
  return candidates.reduce((sum, c) => sum + c.kelly.recommendedUnits, 0);
}
