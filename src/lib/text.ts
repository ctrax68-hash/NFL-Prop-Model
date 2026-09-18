/**
 * Normalise a player name to a join key: strip suffixes and diacritics, then
 * lowercase to bare letters.
 *
 * Used wherever two data sources have to be matched by name because they
 * don't share a stable id — nflverse's snap counts (keyed by name, not
 * gsis_id) against its own player-week rows, ESPN's live boxscore (which has
 * no gsis_id at all) against a priced prop's `playerName`, and a sportsbook's
 * own player name against an nflverse id. "Jr."/"III"/punctuation differences
 * are the main source of near-misses — a suffix has to be stripped as its own
 * word (via `\b` boundaries) before the letters-only strip runs, or it just
 * survives stuck onto the end of the key (e.g. "James Cook" and "James Cook
 * III" would otherwise normalise to two different keys for the same person).
 * Stripping is deliberately aggressive — a false match between two different
 * players is far rarer than a suffix or accent mismatch.
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z]/g, "");
}
