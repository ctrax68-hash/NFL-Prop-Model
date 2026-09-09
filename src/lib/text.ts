/**
 * Normalise a player name to a join key: lowercase, letters only.
 *
 * Used wherever two data sources have to be matched by name because they
 * don't share a stable id — nflverse's snap counts (keyed by name, not
 * gsis_id) against its own player-week rows, and now ESPN's live boxscore
 * (which has no gsis_id at all) against a priced prop's `playerName`.
 * "Jr."/"III"/punctuation differences are the main source of near-misses,
 * so stripping to bare letters is deliberately aggressive — a false match
 * between two different players is far rarer than a suffix mismatch.
 */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
