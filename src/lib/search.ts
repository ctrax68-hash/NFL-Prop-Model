/**
 * Cross-page search over one slate's players and games.
 *
 * Built from `SlateSnapshot.players`/`games` directly rather than
 * `buildBoardRows` — a player with no priced prop this week (limited
 * provider coverage, a bye, whatever) still has a name someone might type,
 * and `buildBoardRows` only ever returns players with a priced market.
 *
 * Case-insensitive substring match, no ranking beyond "starts with beats
 * contains": the corpus is a few hundred players and a handful of games per
 * slate, far below where a real search index would earn its complexity.
 */

import type { SlateSnapshot } from "./pipeline/types";
import type { InjuryStatus } from "./engine/types";

export interface PlayerSearchResult {
  playerId: string;
  name: string;
  teamId: string;
  position: string;
  headshotUrl: string | null;
  injuryStatus?: InjuryStatus;
}

export interface GameSearchResult {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameday: string;
}

export interface SearchIndex {
  players: PlayerSearchResult[];
  games: GameSearchResult[];
}

export function buildSearchIndex(snapshot: SlateSnapshot): SearchIndex {
  return {
    players: snapshot.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      teamId: p.teamId,
      position: p.position,
      headshotUrl: p.headshotUrl,
      injuryStatus: p.injuryStatus,
    })),
    games: snapshot.games.map((g) => ({
      gameId: g.gameId,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      gameday: g.gameday,
    })),
  };
}

function rank(haystack: string, needle: string): number {
  const lower = haystack.toLowerCase();
  if (!lower.includes(needle)) return -1;
  return lower.startsWith(needle) ? 0 : 1;
}

export interface SearchResults {
  players: PlayerSearchResult[];
  games: GameSearchResult[];
}

export function search(
  index: SearchIndex,
  query: string,
  limit = 20,
): SearchResults {
  const needle = query.trim().toLowerCase();
  if (!needle) return { players: [], games: [] };

  const players = index.players
    .map((p) => ({ p, score: rank(p.name, needle) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((entry) => entry.p);

  const games = index.games
    .map((g) => ({
      g,
      score: Math.min(
        rank(g.homeTeam, needle) === -1 ? Infinity : rank(g.homeTeam, needle),
        rank(g.awayTeam, needle) === -1 ? Infinity : rank(g.awayTeam, needle),
      ),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((entry) => entry.g);

  return { players, games };
}
