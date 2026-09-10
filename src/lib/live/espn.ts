/**
 * Live scores and in-game player stats, from ESPN's public (unofficial,
 * undocumented) site API.
 *
 * NOTE ON VERIFICATION: written against ESPN's commonly-observed public
 * response shape — a scoreboard event's `status.type.state` of
 * `"pre"|"in"|"post"` and `shortDetail` string, and a summary's
 * `boxscore.players[].statistics[]` categories with parallel `labels`/`stats`
 * arrays per athlete — but this sandbox's network policy blocks
 * `site.api.espn.com` outright, so it has NOT been exercised against the
 * live service. Same caveat this codebase already carries for the Odds API
 * and NWS providers (`src/lib/ingest/props/oddsApi.ts`, `weather.ts`); both
 * were confirmed correct on their first real run once deployed, and this is
 * the next thing to check the same way, ideally during a live Sunday slate.
 * Every parsing step below degrades to "no live data" rather than throwing,
 * since an unofficial endpoint changing shape is a certainty eventually, and
 * a missing live badge is a far smaller failure than a broken Schedule tab.
 *
 * This is display-only: nothing here feeds the projection engine or gets
 * persisted. It exists so a bettor can watch a stat converge on the line
 * during the game the same way they'd watch a scoreboard app, not to
 * re-project anything mid-game.
 */

import { fetchWithTimeout } from "../ingest/fetchWithTimeout";
import { normaliseName } from "../text";
import type { PropType } from "../engine/types";
import type { SlateGame } from "../pipeline/types";
import type { LiveGameResponse, LiveGameState, LivePlayerLine } from "./types";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const FETCH_TIMEOUT_MS = 8_000;

/**
 * nflverse and ESPN mostly share team abbreviations; these are the known
 * exceptions. Anything not listed here is assumed to already match — a
 * missing alias just fails the game-matching lookup below rather than
 * mismatching to the wrong team, since the match requires both teams and
 * the week to agree.
 */
const ESPN_TEAM_ALIAS: Record<string, string> = {
  WSH: "WAS",
  LAR: "LA",
};

function toNflverseTeam(espnAbbr: string): string {
  return ESPN_TEAM_ALIAS[espnAbbr] ?? espnAbbr;
}

// --- Raw ESPN response shapes (only the fields read below) -----------------

export interface RawEspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team?: { abbreviation?: string };
}

export interface RawEspnEvent {
  id: string;
  status?: {
    type?: { state?: string; shortDetail?: string; detail?: string };
  };
  competitions?: Array<{ competitors?: RawEspnCompetitor[] }>;
}

export interface RawEspnScoreboard {
  events?: RawEspnEvent[];
}

export interface RawEspnAthleteStat {
  athlete?: { displayName?: string };
  stats?: string[];
}

export interface RawEspnStatCategory {
  name?: string;
  labels?: string[];
  athletes?: RawEspnAthleteStat[];
}

export interface RawEspnPlayerGroup {
  team?: { abbreviation?: string };
  statistics?: RawEspnStatCategory[];
}

export interface RawEspnSummary {
  boxscore?: { players?: RawEspnPlayerGroup[] };
}

/** `"2025_18_NYJ_BUF"` -> `{ season: 2025, week: 18, awayTeam: "NYJ", homeTeam: "BUF" }`. */
export function parseGameId(
  gameId: string,
): { season: number; week: number; awayTeam: string; homeTeam: string } | null {
  const match = /^(\d{4})_(\d{1,2})_([A-Z]{2,3})_([A-Z]{2,3})$/.exec(gameId);
  if (!match) return null;
  return {
    season: Number(match[1]),
    week: Number(match[2]),
    awayTeam: match[3],
    homeTeam: match[4],
  };
}

// --- Fetch -------------------------------------------------------------

/**
 * Every event on ESPN's board for a week, unfiltered.
 *
 * `no-store`: this is also called from the Schedule page (a `force-dynamic`
 * route) to decide whether a just-finished game should sink to the bottom of
 * the list — the one thing that fix can't tolerate is Next's fetch cache
 * quietly serving back the same "still in progress" scoreboard on a later
 * request.
 */
export async function fetchEspnScoreboard(
  season: number,
  week: number,
): Promise<RawEspnScoreboard> {
  const url = `${ESPN_BASE}/scoreboard?year=${season}&week=${week}&seasontype=2`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN scoreboard returned ${res.status}`);
  return (await res.json()) as RawEspnScoreboard;
}

export async function fetchEspnSummary(eventId: string): Promise<RawEspnSummary> {
  const url = `${ESPN_BASE}/summary?event=${eventId}`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`ESPN summary returned ${res.status}`);
  return (await res.json()) as RawEspnSummary;
}

/**
 * The full round trip for one nflverse game: find its ESPN event on the
 * week's board, then pull that event's box score. Returns null wherever the
 * game can't be found or hasn't started — pregame boxscores are empty, and
 * there's nothing useful to show before kickoff anyway.
 */
export async function fetchLiveGame(gameId: string): Promise<LiveGameResponse | null> {
  const parsed = parseGameId(gameId);
  if (!parsed) return null;

  const scoreboard = await fetchEspnScoreboard(parsed.season, parsed.week);
  const event = findEvent(scoreboard, parsed.awayTeam, parsed.homeTeam);
  if (!event) return null;

  const state = parseGameState(event);
  if (state.status === "pre") return { game: state, players: [] };

  const summary = await fetchEspnSummary(event.id);
  return { game: state, players: parseBoxscore(summary) };
}

/**
 * Which of a week's games ESPN already calls over, independent of the
 * pipeline's own grading — the persisted slate only gets `homeScore`/
 * `awayScore` once the weekly pipeline re-runs (see
 * `.github/workflows/scrape-and-store.yml`'s cron), which can lag a real
 * result by days for anything outside that schedule. The Schedule page's
 * per-card live poll already papers over this for each card's own display;
 * this is the same signal fetched once for the whole week so the page's
 * "games left" count and sort order can agree with what the cards already
 * show, without waiting for the next pipeline run.
 *
 * Best-effort: ESPN's endpoint is unofficial and unauthenticated (same
 * caveat as the rest of this file), so any failure here — a thrown request,
 * a shape ESPN changed — just degrades to an empty set rather than a broken
 * Schedule page.
 */
export async function fetchPostGameIds(
  season: number,
  week: number,
  games: readonly Pick<SlateGame, "gameId" | "awayTeam" | "homeTeam">[],
): Promise<Set<string>> {
  try {
    const scoreboard = await fetchEspnScoreboard(season, week);
    const post = new Set<string>();
    for (const game of games) {
      const event = findEvent(scoreboard, game.awayTeam, game.homeTeam);
      if (event && parseGameState(event).status === "post") post.add(game.gameId);
    }
    return post;
  } catch {
    return new Set();
  }
}

// --- Parse (pure, tested against a recorded fixture) ------------------

export function findEvent(
  scoreboard: RawEspnScoreboard,
  awayTeam: string,
  homeTeam: string,
): RawEspnEvent | null {
  for (const event of scoreboard.events ?? []) {
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const away = competitors.find((c) => c.homeAway === "away");
    const home = competitors.find((c) => c.homeAway === "home");
    const awayAbbr = away?.team?.abbreviation;
    const homeAbbr = home?.team?.abbreviation;
    if (!awayAbbr || !homeAbbr) continue;

    if (toNflverseTeam(awayAbbr) === awayTeam && toNflverseTeam(homeAbbr) === homeTeam) {
      return event;
    }
  }
  return null;
}

const KNOWN_STATUSES = new Set(["pre", "in", "post"]);

export function parseGameState(event: RawEspnEvent): LiveGameState {
  const rawState = event.status?.type?.state ?? "pre";
  const status = KNOWN_STATUSES.has(rawState) ? (rawState as LiveGameState["status"]) : "pre";
  const detail = event.status?.type?.shortDetail ?? event.status?.type?.detail ?? "";

  const competitors = event.competitions?.[0]?.competitors ?? [];
  const scoreFor = (side: "home" | "away") => {
    const raw = competitors.find((c) => c.homeAway === side)?.score;
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  return { status, detail, homeScore: scoreFor("home"), awayScore: scoreFor("away") };
}

/** label -> value lookup for one athlete's stat line within a category. */
function statByLabel(labels: readonly string[], stats: readonly string[], label: string): number | null {
  const i = labels.indexOf(label);
  if (i === -1 || i >= stats.length) return null;
  const n = Number(stats[i]);
  return Number.isFinite(n) ? n : null;
}

/**
 * One stat category's line for one athlete, as our own prop stats.
 * "C/ATT" is ESPN's combined completions/attempts cell (e.g. "24/35").
 */
function statsFromCategory(
  categoryName: string,
  labels: readonly string[],
  stats: readonly string[],
): Partial<Record<PropType, number>> {
  const out: Partial<Record<PropType, number>> = {};

  if (categoryName === "passing") {
    const combined = labels.indexOf("C/ATT");
    if (combined !== -1 && combined < stats.length) {
      const [c, a] = String(stats[combined]).split("/").map(Number);
      if (Number.isFinite(c)) out.pass_completions = c;
      if (Number.isFinite(a)) out.pass_attempts = a;
    }
    const yards = statByLabel(labels, stats, "YDS");
    if (yards != null) out.passing_yards = yards;
  } else if (categoryName === "rushing") {
    const carries = statByLabel(labels, stats, "CAR");
    if (carries != null) out.rush_attempts = carries;
    const yards = statByLabel(labels, stats, "YDS");
    if (yards != null) out.rushing_yards = yards;
  } else if (categoryName === "receiving") {
    const receptions = statByLabel(labels, stats, "REC");
    if (receptions != null) out.receptions = receptions;
    const yards = statByLabel(labels, stats, "YDS");
    if (yards != null) out.receiving_yards = yards;
  }

  return out;
}

/**
 * Every athlete's live line, merged across the team/category groups ESPN
 * splits a box score into (a rushing QB has separate passing and rushing
 * entries for the same person).
 */
export function parseBoxscore(summary: RawEspnSummary): LivePlayerLine[] {
  const byKey = new Map<string, LivePlayerLine>();

  for (const group of summary.boxscore?.players ?? []) {
    const team = group.team?.abbreviation ?? "";
    for (const category of group.statistics ?? []) {
      const labels = category.labels ?? [];
      for (const entry of category.athletes ?? []) {
        const name = entry.athlete?.displayName;
        if (!name) continue;
        const stats = statsFromCategory(category.name ?? "", labels, entry.stats ?? []);
        if (Object.keys(stats).length === 0) continue;

        const key = normaliseName(name);
        const existing = byKey.get(key);
        if (existing) {
          Object.assign(existing.stats, stats);
        } else {
          byKey.set(key, { key, name, team: toNflverseTeam(team), stats });
        }
      }
    }
  }

  return [...byKey.values()];
}
