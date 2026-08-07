/**
 * Server-side data access for the UI.
 *
 * Reads whichever store is configured. The board, prop detail and tracker all
 * go through here so a page never touches the filesystem or Supabase directly.
 */

import "server-only";

import { createStore } from "./db/factory";
import type { ClosingLine, PlacedBet, SlateStore } from "./db/store";
import { marketKey } from "./engine/types";
import type { SlateSnapshot, SlateSummary } from "./pipeline/types";
import type { BacktestResult } from "./backtest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

let cached: SlateStore | null = null;

/**
 * The storage backend for this process, memoised.
 *
 * Defaults to the file store, which needs no setup. Set
 * `STORE_BACKEND=supabase` (plus the Supabase env vars) to use hosted Postgres.
 */
export function getStore(): SlateStore {
  if (!cached) cached = createStore();
  return cached;
}

/**
 * Every read below is failure-tolerant on purpose.
 *
 * `listSlates()` is called from the root layout, so it runs on literally every
 * page — including the statically prerendered 404. An unreachable or
 * misconfigured store used to throw straight through that call and take the
 * entire site down with it, build included. A data backend being down should
 * cost you the data, not the application: these degrade to an empty slate list
 * and the UI's existing empty states.
 *
 * Errors are logged rather than swallowed silently, so a broken backend is
 * still visible in the server logs.
 */
async function safely<T>(
  what: string,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(
      `[data] ${what} failed; serving fallback.`,
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}

export async function listSlates(): Promise<SlateSummary[]> {
  return safely("listSlates", [], () => getStore().listSlates());
}

/** The most recent slate, or the one requested. */
export async function getSlate(
  season?: number,
  week?: number,
): Promise<SlateSnapshot | null> {
  return safely("getSlate", null, async () => {
    const store = getStore();

    if (season != null && week != null) {
      return store.loadSnapshot(season, week);
    }

    const slates = await store.listSlates();
    if (slates.length === 0) return null;
    return store.loadSnapshot(slates[0].season, slates[0].week);
  });
}

export async function listBets(): Promise<PlacedBet[]> {
  return safely("listBets", [], () => getStore().listBets());
}

export async function getClosingLine(
  propId: string,
  season: number,
  week: number,
): Promise<ClosingLine | null> {
  return safely("getClosingLine", null, () =>
    getStore().getClosingLine(propId, season, week),
  );
}

export async function getBacktest(): Promise<BacktestResult | null> {
  // Local working output first, committed seed second — same precedence as
  // FileSlateStore, so dev and deploy behave identically.
  for (const dir of [".data", "data"]) {
    const file = path.join(process.cwd(), dir, "backtest.json");
    if (existsSync(file)) {
      return safely("getBacktest", null, async () =>
        JSON.parse(await readFile(file, "utf8")) as BacktestResult,
      );
    }
  }
  return null;
}

/**
 * Which slate a prop belongs to, read off the prop's own id.
 *
 * A prop id is `<gameId>|<playerId>|<propType>`, and a game id always leads
 * with `<season>_<week>_`, so the slate is recoverable from the id alone. That
 * matters because the prop page otherwise has to be told which week to look
 * in: before this, every link into a slate that was not the newest one — board
 * rows, the ticker, the tracker, anything bookmarked — resolved against the
 * latest slate, failed to find the prop and 404'd. With one or two slates that
 * was nearly invisible; across six seasons it would be the common case.
 *
 * Returns null for anything that does not parse, so the caller falls back to
 * the default slate rather than inventing one.
 */
export function slateKeyForProp(
  propId: string,
): { season: number; week: number } | null {
  const match = /^(\d{4})_(\d{1,2})_/.exec(propId);
  if (!match) return null;
  return { season: Number(match[1]), week: Number(match[2]) };
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
  propType: SlateSnapshot["props"][number]["propType"];
  projectedValue: number;
  sigma: number;
  /** Every book quoting this market, best edge first. Length 1 outside a multi-book feed. */
  books: BoardRowBook[];
}

export function buildBoardRows(snapshot: SlateSnapshot): BoardRow[] {
  const playerById = new Map(snapshot.players.map((p) => [p.playerId, p]));
  const gameById = new Map(snapshot.games.map((g) => [g.gameId, g]));
  const propById = new Map(snapshot.props.map((p) => [p.propId, p]));
  const recByProp = new Map(
    snapshot.recommendations.map((r) => [r.propId, r]),
  );

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
      propType: entries[0].propType,
      projectedValue: entries[0].projectedValue,
      sigma: entries[0].sigma,
      books,
    });
  }

  return rows.sort((a, b) => b.bestEdge - a.bestEdge);
}
