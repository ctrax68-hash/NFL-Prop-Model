/**
 * Pick a props provider from configuration.
 */

import type { DataBundle } from "../../pipeline/bundle";
import { computeBaselines } from "../baselines";
import {
  createNameResolver,
  OddsApiPropsProvider,
  normaliseName,
  type OddsApiEvent,
} from "./oddsApi";
import { SyntheticPropsProvider } from "./synthetic";
import type { PropsProvider } from "./provider";

/** nflverse team abbreviations for the full names The Odds API returns. */
const TEAM_BY_FULL_NAME: Record<string, string> = {
  "arizona cardinals": "ARI",
  "atlanta falcons": "ATL",
  "baltimore ravens": "BAL",
  "buffalo bills": "BUF",
  "carolina panthers": "CAR",
  "chicago bears": "CHI",
  "cincinnati bengals": "CIN",
  "cleveland browns": "CLE",
  "dallas cowboys": "DAL",
  "denver broncos": "DEN",
  "detroit lions": "DET",
  "green bay packers": "GB",
  "houston texans": "HOU",
  "indianapolis colts": "IND",
  "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC",
  "las vegas raiders": "LV",
  "los angeles chargers": "LAC",
  "los angeles rams": "LA",
  "miami dolphins": "MIA",
  "minnesota vikings": "MIN",
  "new england patriots": "NE",
  "new orleans saints": "NO",
  "new york giants": "NYG",
  "new york jets": "NYJ",
  "philadelphia eagles": "PHI",
  "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF",
  "seattle seahawks": "SEA",
  "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN",
  "washington commanders": "WAS",
};

export function createPropsProvider(
  name: string,
  bundle: DataBundle,
): PropsProvider {
  if (name !== "odds-api") {
    return new SyntheticPropsProvider();
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PROPS_PROVIDER=odds-api requires ODDS_API_KEY. Get one at https://the-odds-api.com, " +
        "or use the default synthetic provider.",
    );
  }

  // Resolve book player names against nflverse ids using the full history, so
  // a player who has not featured recently still maps correctly.
  const latest = bundle.playerWeeks.reduce(
    (acc, row) =>
      row.season > acc.season || (row.season === acc.season && row.week > acc.week)
        ? { season: row.season, week: row.week }
        : acc,
    { season: 0, week: 0 },
  );
  const records = computeBaselines({
    playerWeeks: bundle.playerWeeks,
    teamWeeks: bundle.teamWeeks,
    asOf: { season: latest.season, week: latest.week + 1 },
  });

  const players = new Map(
    [...records.values()].map((record) => [
      record.baseline.playerId,
      { name: record.baseline.name, teamId: record.baseline.teamId },
    ]),
  );

  const gameIdByTeams = new Map<string, string>();
  for (const game of bundle.games) {
    gameIdByTeams.set(`${game.season}|${game.homeTeam}|${game.awayTeam}`, game.gameId);
  }

  const matchGame = (event: OddsApiEvent): string | null => {
    const home = TEAM_BY_FULL_NAME[event.home_team?.toLowerCase() ?? ""];
    const away = TEAM_BY_FULL_NAME[event.away_team?.toLowerCase() ?? ""];
    if (!home || !away) return null;

    const season = new Date(event.commence_time).getUTCFullYear();
    // The NFL season spans the new year, so January games belong to the prior
    // season's schedule.
    const month = new Date(event.commence_time).getUTCMonth();
    const seasonYear = month <= 1 ? season - 1 : season;

    return gameIdByTeams.get(`${seasonYear}|${home}|${away}`) ?? null;
  };

  return new OddsApiPropsProvider(
    {
      apiKey,
      // `||`, not `??`: an unset GitHub Actions repo Variable still shows up
      // as an env var here, just set to "" rather than being absent. `??`
      // only falls back on null/undefined, so "" silently reached the API as
      // an empty `regions=` param and got a hard 422 INVALID_REGION back.
      bookmakers: process.env.ODDS_API_BOOKMAKERS || "draftkings,fanduel",
      regions: process.env.ODDS_API_REGIONS || "us",
    },
    createNameResolver(players),
    matchGame,
  );
}

export { normaliseName };
