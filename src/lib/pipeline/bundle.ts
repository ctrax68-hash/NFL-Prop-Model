/**
 * Load and pre-aggregate every nflverse dataset the pipeline needs.
 *
 * A backtest runs the pipeline for a hundred-plus weeks; parsing the source
 * files once and reusing the bundle turns that from minutes into seconds.
 */

import {
  loadDepthChartsForSeasons,
  loadGames,
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

export interface DataBundle {
  seasons: number[];
  playerWeeks: PlayerWeek[];
  games: GameRow[];
  snapCounts: SnapCountRow[];
  teamWeeks: TeamWeek[];
  margins: Map<string, number>;
  depthChart: DepthChartIndex;
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
  const [playerWeeks, games, snapBatches, depthChartRows] = await Promise.all([
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
  ]);

  const snapCounts = snapBatches.flat();
  const teamWeeks = aggregateTeamWeeks(playerWeeks);

  return {
    seasons: [...seasons],
    playerWeeks,
    games,
    snapCounts,
    teamWeeks,
    margins: buildMarginIndex(games),
    depthChart: buildDepthChartIndex(depthChartRows, games),
  };
}
