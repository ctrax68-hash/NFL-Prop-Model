/**
 * Persistence boundary.
 *
 * The pipeline and UI talk to this interface, never to a specific backend.
 * Two implementations ship: a JSON file store (zero setup, used by the scripts
 * and local development) and a Supabase store (hosted Postgres, used once the
 * project's credentials are configured).
 */

import type { PropType, Side } from "../engine/types";
import type { SlateSnapshot, SlateSummary } from "../pipeline/types";

export type BetStatus = "pending" | "won" | "lost" | "push" | "void";

export interface PlacedBet {
  id: string;
  propId: string;
  season: number;
  week: number;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  propType: PropType;
  lineValue: number;
  side: Side;
  oddsAmerican: number;
  units: number;
  stake: number;
  modelProb: number;
  fairProb: number;
  edge: number;
  placedAt: string;

  status: BetStatus;
  actualValue: number | null;
  profitUnits: number | null;
  settledAt: string | null;
}

export interface SlateStore {
  readonly kind: string;
  saveSnapshot(snapshot: SlateSnapshot): Promise<void>;
  loadSnapshot(season: number, week: number): Promise<SlateSnapshot | null>;
  listSlates(): Promise<SlateSummary[]>;

  placeBets(bets: readonly PlacedBet[]): Promise<void>;
  listBets(): Promise<PlacedBet[]>;
  updateBets(bets: readonly PlacedBet[]): Promise<void>;
}

/**
 * Grade a bet against the actual result.
 * Returns the same bet when there is nothing to settle yet.
 */
export function settleBet(bet: PlacedBet, actualValue: number | null): PlacedBet {
  if (bet.status !== "pending" || actualValue == null) return bet;

  const { lineValue, side, oddsAmerican, units } = bet;

  let status: BetStatus;
  if (actualValue === lineValue) {
    status = "push";
  } else if (side === "over") {
    status = actualValue > lineValue ? "won" : "lost";
  } else {
    status = actualValue < lineValue ? "won" : "lost";
  }

  const profitMultiple =
    oddsAmerican > 0 ? oddsAmerican / 100 : 100 / -oddsAmerican;

  const profitUnits =
    status === "won" ? units * profitMultiple : status === "lost" ? -units : 0;

  return {
    ...bet,
    status,
    actualValue,
    profitUnits,
    settledAt: new Date().toISOString(),
  };
}
