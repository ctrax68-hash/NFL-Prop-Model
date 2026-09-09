/**
 * Load and pre-aggregate every nflverse dataset the pipeline needs.
 *
 * A backtest runs the pipeline for a hundred-plus weeks; parsing the source
 * files once and reusing the bundle turns that from minutes into seconds.
 */

import {
  loadDepthChartsForSeasons,
  loadGames,
  loadInjuriesForSeasons,
  loadPlayerWeeksForSeasons,
  loadSnapCounts,
  type FetchOptions,
  type GameRow,
  type PlayerWeek,
  type SnapCountRow,
} from "../ingest/nflverse";
import {
  aggregateTeamWeeks,
  buildMarginIndex,
  type TeamWeek,
} from "../ingest/teamRates";
import { buildDepthChartIndex, type DepthChartIndex } from "../ingest/depthChartIndex";
import { buildInjuryIndex, type InjuryIndex } from "../ingest/injuryIndex";
import { attachWeatherForecasts } from "../ingest/weather";
import { STADIUM_COORDINATES } from "../ingest/stadiums";

export interface DataBundle {
  seasons: number[];
  playerWeeks: PlayerWeek[];
  games: GameRow[];
  snapCounts: SnapCountRow[];
  teamWeeks: TeamWeek[];
  margins: Map<string, number>;
  depthChart: DepthChartIndex;
  injuries: InjuryIndex;
}

/** How many prior seasons of history to load alongside the target season. */
export const DEFAULT_HISTORY_SEASONS = 2;

export function seasonsToLoad(
  targetSeasons: readonly number[],
  history = DEFAULT_HISTORY_SEASONS,
): number[] {
  const earliest = Math.min(...targetSeasons) - history;
  const latest = Math.max(...targetSeasons);
  const out: number[] = [];
  for (let season = earliest; season <= latest; season += 1) out.push(season);
  return out;
}

export async function loadDataBundle(
  seasons: readonly number[],
  options: FetchOptions & { includeSnapCounts?: boolean } = {},
): Promise<DataBundle> {
  const [playerWeeks, games, snapBatches, depthChartRows, injuryRows] =
    await Promise.all([
      loadPlayerWeeksForSeasons(seasons, options),
      loadGames(options),
      options.includeSnapCounts === false
        ? Promise.resolve([] as SnapCountRow[][])
        : Promise.all(
            seasons.map((season) =>
              // Snap counts are a nice-to-have for display; a missing season
              // should not take the whole run down.
              loadSnapCounts(season, options).catch(() => [] as SnapCountRow[]),
            ),
          ),
      // Same tolerance as snap counts: depth charts sharpen the projection but
      // a missing/renamed release should not take the whole run down.
      loadDepthChartsForSeasons(seasons, options).catch(() => []),
      // Same tolerance again: injury status sharpens the slate but a
      // missing/renamed release should not take the whole run down.
      loadInjuriesForSeasons(seasons, options).catch(() => []),
    ]);

  const snapCounts = snapBatches.flat();
  const teamWeeks = aggregateTeamWeeks(playerWeeks);
  // No-ops entirely (returns `games` unchanged) unless NWS_USER_AGENT is set,
  // and only ever fills in games that haven't been played and have no
  // recorded temperature yet — see attachWeatherForecasts's own doc comment.
  const gamesWithWeather = await attachWeatherForecasts(games, STADIUM_COORDINATES);

  return {
    seasons: [...seasons],
    playerWeeks,
    games: gamesWithWeather,
    snapCounts,
    teamWeeks,
    margins: buildMarginIndex(games),
    depthChart: buildDepthChartIndex(depthChartRows, games),
    injuries: buildInjuryIndex(injuryRows),
  };
}
