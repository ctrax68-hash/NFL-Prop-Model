/**
 * Server-side data access for the UI.
 *
 * Reads whichever store is configured. The board, prop detail and tracker all
 * go through here so a page never touches the filesystem or Supabase directly.
 */

import "server-only";

import { createStore } from "./db/factory";
import type {
  AlertSubscription,
  ClosingLine,
  LineHistoryPoint,
  PlacedBet,
  SlateStore,
  WatchedProp,
} from "./db/store";
import type { PropType } from "./engine/types";
import type { SlateSnapshot, SlateSummary } from "./pipeline/types";
import type { BacktestResult } from "./backtest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export { buildBoardRows, type BoardRow, type BoardRowBook } from "./board";

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

export async function listBets(userId: string): Promise<PlacedBet[]> {
  return safely("listBets", [], () => getStore().listBets(userId));
}

export async function listWatchedProps(userId: string): Promise<WatchedProp[]> {
  return safely("listWatchedProps", [], () => getStore().listWatchedProps(userId));
}

export async function listAlertSubscriptions(
  userId: string,
): Promise<AlertSubscription[]> {
  return safely("listAlertSubscriptions", [], () =>
    getStore().listAlertSubscriptions(userId),
  );
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

export async function getLineHistory(
  gameId: string,
  playerId: string,
  propType: PropType,
  season: number,
  week: number,
): Promise<LineHistoryPoint[]> {
  return safely("getLineHistory", [], () =>
    getStore().getLineHistory(gameId, playerId, propType, season, week),
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

