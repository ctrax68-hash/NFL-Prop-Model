/**
 * Server-side data access for the UI.
 *
 * Reads whichever store is configured. The board, prop detail and tracker all
 * go through here so a page never touches the filesystem or Supabase directly.
 */

import "server-only";

import { createStore } from "./db/factory";
import type { PlacedBet, SlateStore } from "./db/store";
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

/** Everything the board needs about one prop, joined up. */
export interface BoardRow {
  propId: string;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  headshotUrl: string | null;
  opponentLabel: string;
  gameday: string;
  propType: SlateSnapshot["props"][number]["propType"];
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
  projectedValue: number;
  sigma: number;
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

export function buildBoardRows(snapshot: SlateSnapshot): BoardRow[] {
  const playerById = new Map(snapshot.players.map((p) => [p.playerId, p]));
  const gameById = new Map(snapshot.games.map((g) => [g.gameId, g]));
  const propById = new Map(snapshot.props.map((p) => [p.propId, p]));
  const recByProp = new Map(
    snapshot.recommendations.map((r) => [r.propId, r]),
  );

  const rows: BoardRow[] = [];

  for (const evaluation of snapshot.evaluations) {
    const prop = propById.get(evaluation.propId);
    const player = playerById.get(evaluation.playerId);
    const game = gameById.get(evaluation.gameId);
    if (!prop || !player || !game) continue;

    const bestSide =
      evaluation.edgeOver >= evaluation.edgeUnder ? "over" : "under";
    const recommendation = recByProp.get(evaluation.propId);

    rows.push({
      propId: evaluation.propId,
      gameId: evaluation.gameId,
      playerId: evaluation.playerId,
      playerName: player.name,
      teamId: player.teamId,
      position: player.position,
      headshotUrl: player.headshotUrl,
      opponentLabel:
        player.teamId === game.homeTeam
          ? `vs ${game.awayTeam}`
          : `@ ${game.homeTeam}`,
      gameday: game.gameday,
      propType: evaluation.propType,
      lineValue: evaluation.lineValue,
      oddsOverAmerican: prop.oddsOverAmerican,
      oddsUnderAmerican: prop.oddsUnderAmerican,
      projectedValue: evaluation.projectedValue,
      sigma: evaluation.sigma,
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
    });
  }

  return rows.sort((a, b) => b.bestEdge - a.bestEdge);
}
