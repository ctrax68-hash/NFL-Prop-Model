/**
 * Fetch and parse the nflverse public datasets.
 *
 * Everything here is free and needs no API key. Files are cached under
 * `.cache/nflverse` because a backtest re-reads the same seasons many times and
 * the weekly stats files are several megabytes each.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import Papa from "papaparse";

import type { WeatherType } from "../engine/types";

const NFLVERSE_RELEASE = "https://github.com/nflverse/nflverse-data/releases/download";
/** Schedules with closing spreads, totals and weather live in a separate repo. */
const NFLDATA_GAMES =
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

const CACHE_DIR = path.join(process.cwd(), ".cache", "nflverse");

/** Seasons with a published weekly stats file under the current naming scheme. */
export const EARLIEST_SEASON = 2020;

export interface FetchOptions {
  /** Ignore any cached copy and re-download. */
  refresh?: boolean;
}

async function fetchCsvText(url: string, options: FetchOptions = {}): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const key = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const cachePath = path.join(CACHE_DIR, `${key}.csv`);

  if (!options.refresh && existsSync(cachePath)) {
    return readFile(cachePath, "utf8");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  await writeFile(cachePath, text, "utf8");
  return text;
}

function parseCsv<T>(text: string): T[] {
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return result.data;
}

function num(value: string | undefined | null): number {
  if (value == null || value === "" || value === "NA") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: string | undefined | null): number | null {
  if (value == null || value === "" || value === "NA") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Weekly player statistics
// ---------------------------------------------------------------------------

export interface PlayerWeek {
  playerId: string;
  name: string;
  position: string;
  team: string;
  opponent: string;
  season: number;
  week: number;
  seasonType: string;
  headshotUrl: string | null;

  completions: number;
  attempts: number;
  passingYards: number;
  sacksSuffered: number;

  carries: number;
  rushingYards: number;

  receptions: number;
  targets: number;
  receivingYards: number;
  targetShare: number | null;
}

interface RawPlayerWeek {
  player_id: string;
  player_display_name: string;
  position: string;
  team: string;
  opponent_team: string;
  season: string;
  week: string;
  season_type: string;
  headshot_url: string;
  completions: string;
  attempts: string;
  passing_yards: string;
  sacks_suffered: string;
  carries: string;
  rushing_yards: string;
  receptions: string;
  targets: string;
  receiving_yards: string;
  target_share: string;
}

/**
 * Weekly per-player statistics for one season.
 *
 * nflverse renamed this release: seasons from 2020 on are published as
 * `stats_player_week_{season}`, while older tooling referenced
 * `player_stats_{season}`. We try the current name first and fall back, so the
 * loader keeps working across the rename.
 */
export async function loadPlayerWeeks(
  season: number,
  options: FetchOptions = {},
): Promise<PlayerWeek[]> {
  let text: string;
  try {
    text = await fetchCsvText(
      `${NFLVERSE_RELEASE}/stats_player/stats_player_week_${season}.csv`,
      options,
    );
  } catch {
    text = await fetchCsvText(
      `${NFLVERSE_RELEASE}/player_stats/player_stats_${season}.csv`,
      options,
    );
  }

  const rows = parseCsv<RawPlayerWeek & Record<string, string>>(text);

  return rows
    .filter((row) => row.player_id && row.week)
    .map((row) => ({
      playerId: row.player_id,
      // The legacy file names these columns slightly differently.
      name: row.player_display_name ?? row.player_name ?? "",
      position: row.position ?? "",
      team: row.team ?? row.recent_team ?? "",
      opponent: row.opponent_team ?? "",
      season: num(row.season),
      week: num(row.week),
      seasonType: row.season_type ?? "REG",
      headshotUrl: row.headshot_url || null,

      completions: num(row.completions),
      attempts: num(row.attempts),
      passingYards: num(row.passing_yards),
      sacksSuffered: num(row.sacks_suffered ?? row.sacks),

      carries: num(row.carries),
      rushingYards: num(row.rushing_yards),

      receptions: num(row.receptions),
      targets: num(row.targets),
      receivingYards: num(row.receiving_yards),
      targetShare: numOrNull(row.target_share),
    }));
}

export async function loadPlayerWeeksForSeasons(
  seasons: readonly number[],
  options: FetchOptions = {},
): Promise<PlayerWeek[]> {
  const batches = await Promise.all(
    seasons.map((season) => loadPlayerWeeks(season, options)),
  );
  return batches.flat();
}

// ---------------------------------------------------------------------------
// Schedule, betting lines and weather
// ---------------------------------------------------------------------------

export interface GameRow {
  gameId: string;
  season: number;
  week: number;
  gameType: string;
  gameday: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  /**
   * Home team's spread in standard betting convention: NEGATIVE means the home
   * team is favoured.
   *
   * nflverse publishes `spread_line` with the opposite sign — positive means
   * the home team is favoured — so it is flipped here. Getting this backwards
   * silently inverts every game-script adjustment in the model, so it is
   * covered by a test against real results.
   */
  spreadHome: number | null;
  total: number | null;
  roof: string;
  temperatureF: number | null;
  windSpeedMph: number | null;
  weatherType: WeatherType;
}

interface RawGame {
  game_id: string;
  season: string;
  game_type: string;
  week: string;
  gameday: string;
  away_team: string;
  away_score: string;
  home_team: string;
  home_score: string;
  spread_line: string;
  total_line: string;
  roof: string;
  temp: string;
  wind: string;
}

/** Indoor venues; anything else is treated as exposed to the weather. */
const INDOOR_ROOFS = new Set(["dome", "closed"]);

function classifyWeather(roof: string, temperatureF: number | null): WeatherType {
  if (INDOOR_ROOFS.has(roof)) return "dome";
  // nflverse does not publish a precipitation flag, so snow is inferred from
  // freezing temperatures in an open-air stadium and rain is left unmodelled.
  if (temperatureF != null && temperatureF <= 32) return "snow";
  return "outdoors";
}

export async function loadGames(options: FetchOptions = {}): Promise<GameRow[]> {
  const text = await fetchCsvText(NFLDATA_GAMES, options);
  const rows = parseCsv<RawGame>(text);

  return rows
    .filter((row) => row.game_id)
    .map((row) => {
      const temperatureF = numOrNull(row.temp);
      const spreadLine = numOrNull(row.spread_line);
      return {
        gameId: row.game_id,
        season: num(row.season),
        week: num(row.week),
        gameType: row.game_type,
        gameday: row.gameday,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        homeScore: numOrNull(row.home_score),
        awayScore: numOrNull(row.away_score),
        spreadHome: spreadLine == null ? null : -spreadLine,
        total: numOrNull(row.total_line),
        roof: row.roof ?? "",
        temperatureF,
        windSpeedMph: numOrNull(row.wind),
        weatherType: classifyWeather(row.roof ?? "", temperatureF),
      };
    });
}

// ---------------------------------------------------------------------------
// Snap counts
// ---------------------------------------------------------------------------

export interface SnapCountRow {
  season: number;
  week: number;
  player: string;
  team: string;
  position: string;
  offenseSnaps: number;
  offensePct: number;
}

interface RawSnapCount {
  season: string;
  week: string;
  player: string;
  team: string;
  position: string;
  offense_snaps: string;
  offense_pct: string;
}

export async function loadSnapCounts(
  season: number,
  options: FetchOptions = {},
): Promise<SnapCountRow[]> {
  const text = await fetchCsvText(
    `${NFLVERSE_RELEASE}/snap_counts/snap_counts_${season}.csv`,
    options,
  );
  const rows = parseCsv<RawSnapCount>(text);

  return rows
    .filter((row) => row.player && row.week)
    .map((row) => ({
      season: num(row.season),
      week: num(row.week),
      player: row.player,
      team: row.team,
      position: row.position,
      offenseSnaps: num(row.offense_snaps),
      offensePct: num(row.offense_pct),
    }));
}
