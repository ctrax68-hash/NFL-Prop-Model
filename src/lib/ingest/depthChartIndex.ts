/**
 * Turn depth-chart scrapes (dated by calendar timestamp) into a lookup keyed
 * by team/player/asOf, so a projection can ask "who was RB1 heading into this
 * game" the same way it asks about trailing box-score stats.
 *
 * Depth charts are scraped roughly daily, so unlike everything else in
 * `ingest/`, they cannot be filtered by season/week alone — a snapshot has to
 * be matched to the calendar date of the games it precedes. The rest of the
 * pipeline's no-lookahead discipline still applies: only snapshots strictly
 * before a week's earliest kickoff are visible to that week's projection.
 */

import type { DepthChartRow, GameRow } from "./nflverse";
import type { Position } from "../engine/types";
import type { SeasonWeek } from "./asOf";

export interface DepthChartIndex {
  /** `${team}|${playerId}` -> snapshots sorted oldest first. */
  byPlayer: Map<string, { at: number; rank: number }[]>;
  /** `${season}|${week}` -> epoch ms of that week's earliest kickoff. */
  weekCutoffs: Map<string, number>;
}

export function buildDepthChartIndex(
  rows: readonly DepthChartRow[],
  games: readonly GameRow[],
): DepthChartIndex {
  const byPlayer = new Map<string, { at: number; rank: number }[]>();
  for (const row of rows) {
    const at = Date.parse(row.scrapedAt);
    if (!Number.isFinite(at)) continue;
    const key = `${row.team}|${row.playerId}`;
    const list = byPlayer.get(key);
    if (list) list.push({ at, rank: row.rank });
    else byPlayer.set(key, [{ at, rank: row.rank }]);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.at - b.at);

  const weekCutoffs = new Map<string, number>();
  for (const game of games) {
    const at = Date.parse(game.gameday);
    if (!Number.isFinite(at)) continue;
    const key = `${game.season}|${game.week}`;
    const existing = weekCutoffs.get(key);
    if (existing == null || at < existing) weekCutoffs.set(key, at);
  }

  return { byPlayer, weekCutoffs };
}

/**
 * The player's depth-chart rank as of the most recent scrape strictly before
 * `asOf`'s earliest kickoff, or null if no schedule or no scrape qualifies.
 */
export function depthRankAt(
  index: DepthChartIndex,
  team: string,
  playerId: string,
  asOf: SeasonWeek,
): number | null {
  const cutoff = index.weekCutoffs.get(`${asOf.season}|${asOf.week}`);
  if (cutoff == null) return null;

  const list = index.byPlayer.get(`${team}|${playerId}`);
  if (!list || list.length === 0) return null;

  let rank: number | null = null;
  for (const snapshot of list) {
    if (snapshot.at >= cutoff) break;
    rank = snapshot.rank;
  }
  return rank;
}

/** Coarse bucket so sparse ranks (3rd string, 4th string...) still pool enough data. */
export function rankBucket(rank: number): string {
  if (rank <= 1) return "1";
  if (rank === 2) return "2";
  return "3+";
}

export function priorKey(position: Position, bucket: string): string {
  return `${position}|${bucket}`;
}
