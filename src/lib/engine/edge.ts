/**
 * Steps 7-9 of the spec, joined up: price a prop against the model and compute
 * the edge on each side.
 */

import { computeOverUnder, estimateSigma } from "./distribution";
import { americanToImpliedProb, devig, expectedValue } from "./odds";
import { clamp } from "./math";
import type { EngineConfig } from "./config";
import type { PropLine, Side } from "./types";

export interface PropEvaluationInput {
  prop: PropLine;
  /** Projected mean for the stat this prop prices. */
  projectedValue: number;
  /** The player's own historical sigma for this stat, if available. */
  playerSigma?: number | null;
  /** Mean of the games that sigma was measured over. */
  playerMean?: number | null;
  /** Number of games behind the player's own estimate. */
  playerGames: number;
}

export interface PropEvaluation {
  propId: string;
  playerId: string;
  gameId: string;
  propType: PropLine["propType"];
  lineValue: number;

  projectedValue: number;
  sigma: number;
  distribution: string;

  /** Unconditional model probabilities; these three sum to 1. */
  modelProbOver: number;
  modelProbUnder: number;
  modelProbPush: number;

  /**
   * Model probabilities conditioned on no push, so they are directly
   * comparable with the book's two-way price.
   */
  modelProbOverNoPush: number;
  modelProbUnderNoPush: number;

  rawImpliedOver: number;
  rawImpliedUnder: number;
  fairProbOver: number;
  fairProbUnder: number;
  overround: number;

  edgeOver: number;
  edgeUnder: number;
  evOver: number;
  evUnder: number;
}

export function evaluateProp(
  input: PropEvaluationInput,
  config: EngineConfig,
): PropEvaluation {
  const { prop } = input;

  const sigma = estimateSigma(
    {
      stat: prop.propType,
      projectedMean: input.projectedValue,
      playerSigma: input.playerSigma,
      playerMean: input.playerMean,
      playerGames: input.playerGames,
    },
    config,
  );

  const { probOver, probUnder, probPush, distribution } = computeOverUnder(
    {
      stat: prop.propType,
      mean: input.projectedValue,
      sigma,
      line: prop.lineValue,
    },
    config,
  );

  // A push refunds the stake, so the book's two-way price implicitly prices the
  // no-push world. Conditioning the model the same way keeps the comparison
  // honest on integer lines.
  const decisive = probOver + probUnder;
  const modelProbOverNoPush = decisive > 0 ? probOver / decisive : 0.5;
  const modelProbUnderNoPush = 1 - modelProbOverNoPush;

  const vig = devig(
    prop.oddsOverAmerican,
    prop.oddsUnderAmerican,
    config.odds.devigMethod,
  );

  return {
    propId: prop.propId,
    playerId: prop.playerId,
    gameId: prop.gameId,
    propType: prop.propType,
    lineValue: prop.lineValue,

    projectedValue: input.projectedValue,
    sigma,
    distribution,

    modelProbOver: probOver,
    modelProbUnder: probUnder,
    modelProbPush: probPush,
    modelProbOverNoPush,
    modelProbUnderNoPush,

    rawImpliedOver: vig.rawProbOver,
    rawImpliedUnder: vig.rawProbUnder,
    fairProbOver: vig.fairProbOver,
    fairProbUnder: vig.fairProbUnder,
    overround: vig.overround,

    edgeOver: modelProbOverNoPush - vig.fairProbOver,
    edgeUnder: modelProbUnderNoPush - vig.fairProbUnder,

    evOver: expectedValue(probOver, prop.oddsOverAmerican, probPush),
    evUnder: expectedValue(probUnder, prop.oddsUnderAmerican, probPush),
  };
}

/** Read the fields for one side of an evaluation. */
export function sideOf(evaluation: PropEvaluation, side: Side) {
  const isOver = side === "over";
  return {
    side,
    edge: isOver ? evaluation.edgeOver : evaluation.edgeUnder,
    ev: isOver ? evaluation.evOver : evaluation.evUnder,
    modelProb: isOver ? evaluation.modelProbOver : evaluation.modelProbUnder,
    modelProbNoPush: isOver
      ? evaluation.modelProbOverNoPush
      : evaluation.modelProbUnderNoPush,
    fairProb: isOver ? evaluation.fairProbOver : evaluation.fairProbUnder,
    rawImplied: isOver ? evaluation.rawImpliedOver : evaluation.rawImpliedUnder,
    probPush: evaluation.modelProbPush,
  };
}

/**
 * Closing line value, in probability points.
 *
 * Compares the price actually taken against the de-vigged closing probability
 * of the same side. Positive CLV means the bet beat the closing line. This is
 * the strongest available evidence that a model finds real edges: unlike ROI it
 * is barely affected by variance, so it reads clearly over a few hundred bets
 * where ROI still tells you almost nothing.
 *
 * @param betOddsAmerican Price taken on the bet side.
 * @param closingOddsAmerican Closing price on the bet side.
 * @param closingOppositeOddsAmerican Closing price on the opposite side.
 */
export function closingLineValue(
  betOddsAmerican: number,
  closingOddsAmerican: number,
  closingOppositeOddsAmerican: number,
  config: EngineConfig,
): number {
  const closingFair = devig(
    closingOddsAmerican,
    closingOppositeOddsAmerican,
    config.odds.devigMethod,
  ).fairProbOver;
  const betImplied = americanToImpliedProb(betOddsAmerican);
  return clamp(closingFair - betImplied, -1, 1);
}
