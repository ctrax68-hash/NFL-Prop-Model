/**
 * Best N-leg parlay for N = 1..8, built from the week's own recommendations.
 *
 * A parlay's combined probability is the product of its legs' win
 * probabilities — but only if the legs are independent. That is the load-
 * bearing assumption here, and it is not fully true: two props from the same
 * game share the same pace, script and weather, so their outcomes move
 * together far more than two props from different games do. This module
 * removes the worst case (never more than one leg per game) but the
 * remaining legs are still not proven independent, and the UI must say so —
 * an 8-leg parlay's naive probability is a ceiling on the true one, not an
 * estimate of it.
 */

import { americanToDecimal, decimalToAmerican } from "./engine/odds";
import { sizeBet, type KellyResult } from "./engine/kelly";
import type { BetCandidate } from "./engine/selection";
import type { EngineConfig } from "./engine/config";
import type { SlateSnapshot } from "./pipeline/types";

export interface ParlayLeg {
  propId: string;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  propType: BetCandidate["propType"];
  side: BetCandidate["side"];
  lineValue: number;
  oddsAmerican: number;
  modelProb: number;
  edge: number;
}

export interface ParlayRung {
  legCount: number;
  legs: ParlayLeg[];
  decimalOdds: number;
  americanOdds: number;
  /** Product of each leg's win probability. Only correct under independence. */
  probability: number;
  ev: number;
  kelly: KellyResult;
}

export function buildParlayLadder(
  snapshot: SlateSnapshot,
  config: EngineConfig,
  maxLegs = 8,
): ParlayRung[] {
  const playerById = new Map(snapshot.players.map((p) => [p.playerId, p]));

  // One leg per game. Letting the "best 8" pull several props from the same
  // game — which the board allows for a single-bet slip, up to
  // config.selection.maxBetsPerGame — would make most of the parlay's legs
  // hinge on the same handful of plays instead of eight separate ones.
  const bestPerGame = new Map<string, BetCandidate>();
  for (const candidate of snapshot.recommendations) {
    const current = bestPerGame.get(candidate.gameId);
    if (!current || candidate.ev > current.ev) {
      bestPerGame.set(candidate.gameId, candidate);
    }
  }

  // Rank by ev, not edge: a parlay's combined EV is the product of each leg's
  // (1 + ev), so in log space every leg's contribution is independent of which
  // other legs are chosen. Sorting by ev and taking the top N is therefore
  // already the EV-maximising ladder — no combinatorial search needed.
  const ranked = [...bestPerGame.values()].sort((a, b) => b.ev - a.ev);

  const cap = Math.min(maxLegs, ranked.length);
  const rungs: ParlayRung[] = [];

  for (let n = 1; n <= cap; n += 1) {
    const picks = ranked.slice(0, n);

    const legs: ParlayLeg[] = picks.map((candidate) => {
      const player = playerById.get(candidate.playerId);
      return {
        propId: candidate.propId,
        gameId: candidate.gameId,
        playerId: candidate.playerId,
        playerName: player?.name ?? candidate.playerId,
        teamId: player?.teamId ?? "",
        propType: candidate.propType,
        side: candidate.side,
        lineValue: candidate.lineValue,
        oddsAmerican: candidate.oddsAmerican,
        modelProb: candidate.modelProb,
        edge: candidate.edge,
      };
    });

    const decimalOdds = picks.reduce(
      (acc, candidate) => acc * americanToDecimal(candidate.oddsAmerican),
      1,
    );
    const probability = picks.reduce(
      (acc, candidate) => acc * candidate.modelProb,
      1,
    );
    const americanOdds = decimalToAmerican(decimalOdds);
    const ev = probability * decimalOdds - 1;
    const kelly = sizeBet(
      { probWin: probability, oddsAmerican: americanOdds },
      config,
    );

    rungs.push({ legCount: n, legs, decimalOdds, americanOdds, probability, ev, kelly });
  }

  return rungs;
}
