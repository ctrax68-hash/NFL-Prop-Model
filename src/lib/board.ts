/**
 * Pure board-row assembly: joins a slate's evaluations/props/players/games
 * into display-ready rows.
 *
 * Split out of `data.ts` (which is marked `server-only` — importing it
 * outside a Next.js server component throws) specifically so CLI scripts
 * like `scripts/send-alerts.ts` can read a snapshot's live prices without
 * dragging in a Next.js-only guard. `data.ts` re-exports everything here so
 * every existing `@/lib/data` import keeps working unchanged.
 */

import { grade, type Outcome } from "./backtest/outcome";
import { marketKey, type InjuryStatus } from "./engine/types";
import type { SlateSnapshot } from "./pipeline/types";

/**
 * How a market's chosen side (`bestSide`/`lineValue`) actually turned out,
 * once the pipeline has graded the week — the same "won"/"lost"/"push" a
 * placed bet settles as, plus "void" for a player who never took the field
 * (see `PropActual`). `null` while the game hasn't graded yet — display-only,
 * live in-game tracking is a separate concern (`liveValue`, computed
 * client-side from ESPN, never stored on the row).
 */
export interface BoardRowSettlement {
  actualValue: number | null;
  outcome: Outcome | "void";
}

/** One book's price on a market, everything needed to bet against it. */
export interface BoardRowBook {
  propId: string;
  bookName: string;
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
  modelProbOver: number;
  modelProbUnder: number;
  /** The book's de-vigged fair probability — the baseline edge is measured from. */
  fairProbOver: number;
  fairProbUnder: number;
  edgeOver: number;
  edgeUnder: number;
  bestSide: "over" | "under";
  bestEdge: number;
  recommendedUnits: number;
  isRecommended: boolean;
}

/**
 * Everything the board needs about one market, joined up.
 *
 * A prop id embeds the book (see {@link marketKey}), so two books quoting the
 * same player and stat used to render as two unrelated rows. This groups them
 * by market instead: the top-level fields mirror the best-edge book (so
 * existing sort/filter/tap-to-bet behavior needs no changes), and `books`
 * carries every book's price for a line-shopping affordance.
 */
export interface BoardRow extends BoardRowBook {
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  headshotUrl: string | null;
  opponentLabel: string;
  gameday: string;
  /** UTC ISO instant, or null while nflverse has no time published yet. */
  kickoffAt: string | null;
  propType: SlateSnapshot["props"][number]["propType"];
  projectedValue: number;
  sigma: number;
  /** This week's official injury designation, if any. */
  injuryStatus?: InjuryStatus;
  /** Every book quoting this market, best edge first. Length 1 outside a multi-book feed. */
  books: BoardRowBook[];
  settled: BoardRowSettlement | null;
}

export function buildBoardRows(snapshot: SlateSnapshot): BoardRow[] {
  const playerById = new Map(snapshot.players.map((p) => [p.playerId, p]));
  const gameById = new Map(snapshot.games.map((g) => [g.gameId, g]));
  const propById = new Map(snapshot.props.map((p) => [p.propId, p]));
  const recByProp = new Map(
    snapshot.recommendations.map((r) => [r.propId, r]),
  );
  const actualByProp = new Map(snapshot.actuals.map((a) => [a.propId, a]));

  interface Joined {
    marketKey: string;
    gameId: string;
    playerId: string;
    propType: SlateSnapshot["props"][number]["propType"];
    projectedValue: number;
    sigma: number;
    book: BoardRowBook;
  }

  const joined: Joined[] = [];

  for (const evaluation of snapshot.evaluations) {
    const prop = propById.get(evaluation.propId);
    const player = playerById.get(evaluation.playerId);
    const game = gameById.get(evaluation.gameId);
    if (!prop || !player || !game) continue;

    const bestSide =
      evaluation.edgeOver >= evaluation.edgeUnder ? "over" : "under";
    const recommendation = recByProp.get(evaluation.propId);

    joined.push({
      marketKey: marketKey(evaluation.gameId, evaluation.playerId, evaluation.propType),
      gameId: evaluation.gameId,
      playerId: evaluation.playerId,
      propType: evaluation.propType,
      projectedValue: evaluation.projectedValue,
      sigma: evaluation.sigma,
      book: {
        propId: evaluation.propId,
        bookName: prop.bookName,
        lineValue: evaluation.lineValue,
        oddsOverAmerican: prop.oddsOverAmerican,
        oddsUnderAmerican: prop.oddsUnderAmerican,
        modelProbOver: evaluation.modelProbOverNoPush,
        modelProbUnder: evaluation.modelProbUnderNoPush,
        fairProbOver: evaluation.fairProbOver,
        fairProbUnder: evaluation.fairProbUnder,
        edgeOver: evaluation.edgeOver,
        edgeUnder: evaluation.edgeUnder,
        bestSide,
        bestEdge: bestSide === "over" ? evaluation.edgeOver : evaluation.edgeUnder,
        recommendedUnits: recommendation?.kelly.recommendedUnits ?? 0,
        isRecommended: recommendation != null,
      },
    });
  }

  const byMarket = new Map<string, Joined[]>();
  for (const entry of joined) {
    const list = byMarket.get(entry.marketKey);
    if (list) list.push(entry);
    else byMarket.set(entry.marketKey, [entry]);
  }

  const rows: BoardRow[] = [];
  for (const entries of byMarket.values()) {
    const books = entries
      .map((e) => e.book)
      .sort((a, b) => b.bestEdge - a.bestEdge);
    const best = books[0];
    const { playerId, gameId } = entries[0];
    const player = playerById.get(playerId);
    const game = gameById.get(gameId);
    if (!player || !game) continue;

    const actual = actualByProp.get(best.propId);
    const settled: BoardRowSettlement | null =
      !actual
        ? null
        : actual.actualValue == null
          ? { actualValue: null, outcome: "void" }
          : {
              actualValue: actual.actualValue,
              outcome: grade(best.bestSide, best.lineValue, actual.actualValue),
            };

    rows.push({
      ...best,
      gameId,
      playerId,
      playerName: player.name,
      teamId: player.teamId,
      position: player.position,
      headshotUrl: player.headshotUrl,
      opponentLabel:
        player.teamId === game.homeTeam
          ? `vs ${game.awayTeam}`
          : `@ ${game.homeTeam}`,
      gameday: game.gameday,
      kickoffAt: game.kickoffAt ?? null,
      propType: entries[0].propType,
      projectedValue: entries[0].projectedValue,
      sigma: entries[0].sigma,
      injuryStatus: player.injuryStatus,
      books,
      settled,
    });
  }

  return rows.sort((a, b) => b.bestEdge - a.bestEdge);
}
