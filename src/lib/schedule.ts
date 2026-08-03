/**
 * Resolve "what NFL week is it right now" from the schedule alone.
 *
 * Needed for the unattended weekly scrape — there's no human around to type
 * `--season --week` on a cron. The naive rule ("earliest week that isn't
 * entirely in the past") isn't enough on its own: nflverse typically
 * publishes the whole coming season's schedule months in advance, so without
 * a bound this would call next September's week 1 "current" the moment the
 * schedule is published, all spring and summer.
 *
 * So a week only counts as current if it satisfies both:
 *   1. Not finished    — its last game date is today or later.
 *   2. Arrived or soon — its first game date is within a lookahead window.
 *
 * Bye weeks need no special handling: grouping is by week across the whole
 * league, not per team, so a team's bye never empties a week's group.
 */

import type { GameRow } from "./ingest/nflverse";

const LOOKAHEAD_DAYS = 7;

export interface CurrentWeek {
  season: number;
  week: number;
}

function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseGameday(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function resolveCurrentWeek(
  games: readonly GameRow[],
  now: Date = new Date(),
): CurrentWeek | null {
  const today = toUtcMidnight(now);
  const lookahead = today + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

  const byWeek = new Map<
    string,
    { season: number; week: number; earliest: number; latest: number }
  >();

  for (const game of games) {
    // Playoff weeks are never a target here: the pipeline itself only ever
    // matches regular-season games (see runPipeline's REG filter), so there
    // is nothing for a resolved postseason week to be used for.
    if (game.gameType !== "REG") continue;

    const day = parseGameday(game.gameday);
    if (day == null) continue;

    const key = `${game.season}-${game.week}`;
    const existing = byWeek.get(key);
    if (existing) {
      existing.earliest = Math.min(existing.earliest, day);
      existing.latest = Math.max(existing.latest, day);
    } else {
      byWeek.set(key, {
        season: game.season,
        week: game.week,
        earliest: day,
        latest: day,
      });
    }
  }

  const candidates = [...byWeek.values()]
    .filter((w) => w.latest >= today && w.earliest <= lookahead)
    .sort((a, b) => a.season - b.season || a.week - b.week);

  return candidates.length > 0
    ? { season: candidates[0].season, week: candidates[0].week }
    : null;
}
