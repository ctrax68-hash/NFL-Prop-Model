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
  userId: string;
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

/** The odds captured on a prop's last-known pricing run for its week. */
export interface ClosingLine {
  propId: string;
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
}

/**
 * One pricing pass's price for a market, in chronological order. Reconstructed
 * from every historical pipeline run for the week rather than a dedicated
 * history table — each run already inserts (never upserts) its own `props`
 * rows, so the run history a line-movement chart needs already exists as a
 * side effect of how the pipeline persists a slate.
 */
export interface LineHistoryPoint {
  capturedAt: string;
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
  bookName: string;
  edgeOver: number;
  edgeUnder: number;
}

/**
 * One user watching one market (a game/player/prop-type triple, not a
 * specific book's propId — see `marketKey()` in `src/lib/engine/types.ts`).
 * `captured*` fields are whatever was true at star-time, so a later "did
 * this move" comparison has a concrete baseline without needing a separate
 * price-history producer.
 */
export interface WatchedProp {
  id: string;
  userId: string;
  gameId: string;
  playerId: string;
  propType: PropType;
  season: number;
  week: number;
  playerName: string;
  teamId: string;
  capturedLineValue: number;
  capturedSide: Side;
  capturedEdge: number;
  capturedOddsAmerican: number;
  createdAt: string;
}

export interface SlateStore {
  readonly kind: string;
  saveSnapshot(snapshot: SlateSnapshot): Promise<void>;
  loadSnapshot(season: number, week: number): Promise<SlateSnapshot | null>;
  listSlates(): Promise<SlateSummary[]>;
  /**
   * The odds captured for this prop on the most recent pipeline run for its
   * week — the closest thing to a "closing line" this schema tracks. Only
   * meaningful for a store that keeps a run per pricing pass; see
   * {@link FileSlateStore} for why it always returns null.
   */
  getClosingLine(
    propId: string,
    season: number,
    week: number,
  ): Promise<ClosingLine | null>;

  /**
   * Every historical price for a market (game/player/prop-type — not a bare
   * propId, since a propId embeds the book and the same market can be quoted
   * by more than one), oldest first. Only meaningful for a store that keeps a
   * row per pricing pass; see {@link FileSlateStore} for why it degrades to
   * at most one point.
   */
  getLineHistory(
    gameId: string,
    playerId: string,
    propType: PropType,
    season: number,
    week: number,
  ): Promise<LineHistoryPoint[]>;

  placeBets(bets: readonly PlacedBet[]): Promise<void>;
  /** Only this user's own bets — see `supabase/migrations/0004_accounts.sql`. */
  listBets(userId: string): Promise<PlacedBet[]>;
  updateBets(bets: readonly PlacedBet[]): Promise<void>;

  listWatchedProps(userId: string): Promise<WatchedProp[]>;
  /**
   * Star (or re-star) a market. Upserts on `(userId, gameId, playerId,
   * propType)` — re-starring after a move resets the baseline, which is the
   * correct semantics for "tell me when it moves *again*."
   */
  upsertWatchedProp(
    prop: Omit<WatchedProp, "id" | "createdAt">,
  ): Promise<void>;
  removeWatchedProp(
    userId: string,
    gameId: string,
    playerId: string,
    propType: PropType,
  ): Promise<void>;
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
