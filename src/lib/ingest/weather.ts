/**
 * National Weather Service pregame forecasts.
 *
 * Uses NWS's documented public API shape (`api.weather.gov/points/{lat},{lon}`
 * -> a `forecastHourly` URL -> hourly periods with `startTime`/`endTime`/
 * `temperature`/`windSpeed`/`shortForecast`). Confirmed against the live
 * service by the GitHub Actions pipeline run of 2026-09-09 (2026 week 1):
 * every outdoor game came back with a temperature, wind and condition, and
 * dome games were skipped as intended. The development sandbox itself
 * blocks `api.weather.gov`, so local runs still see no forecasts.
 *
 * Deliberately does not use `fetchCsvText`'s permanent on-disk cache — a
 * forecast is time-sensitive and must never be served stale from a prior
 * run's cached copy the way a season's stat file correctly is.
 */

import { fetchWithTimeout } from "./fetchWithTimeout";
import { toEasternIso } from "./kickoff";
import type { WeatherType } from "../engine/types";

const NWS_BASE = "https://api.weather.gov";

export interface ForecastPeriod {
  startTime: string;
  endTime: string;
  temperatureF: number | null;
  windSpeedMph: number | null;
  shortForecast: string;
  precipitationChancePct: number | null;
}

interface RawNwsPoint {
  properties?: {
    forecastHourly?: string;
  };
}

interface RawNwsForecast {
  properties?: {
    periods?: Array<{
      startTime: string;
      endTime: string;
      temperature: number | null;
      temperatureUnit: string;
      windSpeed: string | null;
      shortForecast: string;
      probabilityOfPrecipitation?: { value: number | null };
    }>;
  };
}

function userAgent(): string | null {
  return process.env.NWS_USER_AGENT || null;
}

/** NWS returns wind as a string like "10 mph" or "10 to 15 mph" — the higher end. */
function parseWindSpeed(value: string | null | undefined): number | null {
  if (!value) return null;
  const matches = [...value.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  return matches.length > 0 ? Math.max(...matches) : null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const agent = userAgent();
  if (!agent) return null;

  const response = await fetchWithTimeout(url, 10_000, {
    headers: { "User-Agent": agent, Accept: "application/geo+json" },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/**
 * The hourly forecast period covering a given instant, or null if the point
 * has no forecast (most likely: NWS's ~7-day horizon doesn't reach that far
 * out yet, or the lookup itself failed).
 */
export async function fetchForecast(
  lat: number,
  lon: number,
  atIso: string,
): Promise<ForecastPeriod | null> {
  const point = await fetchJson<RawNwsPoint>(
    `${NWS_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
  );
  const hourlyUrl = point?.properties?.forecastHourly;
  if (!hourlyUrl) return null;

  const forecast = await fetchJson<RawNwsForecast>(hourlyUrl);
  const periods = forecast?.properties?.periods ?? [];

  const at = Date.parse(atIso);
  if (!Number.isFinite(at)) return null;

  const period = periods.find((p) => {
    const start = Date.parse(p.startTime);
    const end = Date.parse(p.endTime);
    return Number.isFinite(start) && Number.isFinite(end) && at >= start && at < end;
  });
  if (!period) return null;

  return {
    startTime: period.startTime,
    endTime: period.endTime,
    temperatureF: period.temperatureUnit === "F" ? period.temperature : null,
    windSpeedMph: parseWindSpeed(period.windSpeed),
    shortForecast: period.shortForecast ?? "",
    precipitationChancePct: period.probabilityOfPrecipitation?.value ?? null,
  };
}

/** Same rule the historical-weather classifier uses, plus a forecast's own precipitation signal. */
function classifyForecast(
  roof: string,
  temperatureF: number | null,
  shortForecast: string,
): WeatherType {
  if (roof === "dome" || roof === "closed") return "dome";
  const lower = shortForecast.toLowerCase();
  if (lower.includes("snow")) return "snow";
  if (lower.includes("rain") || lower.includes("shower") || lower.includes("storm")) {
    return "rain";
  }
  if (temperatureF != null && temperatureF <= 32) return "snow";
  return "outdoors";
}

export interface WeatherForecastGame {
  gameId: string;
  gameday: string;
  gametime: string | null;
  location: string;
  stadiumId: string | null;
  roof: string;
  homeScore: number | null;
  temperatureF: number | null;
  windSpeedMph: number | null;
  weatherType: WeatherType;
}

/**
 * Fills in a real pregame forecast for upcoming, domestic, outdoor games —
 * mutates nothing, returns new game objects. Bounded scope by construction:
 * `homeScore == null` excludes every played game (including all history
 * loaded for baselines), `location === "Home"` excludes neutral-site/
 * international games (no stadium coordinates for those, by design — see
 * `stadiums.ts`), and an indoor `roof` never needs a forecast at all.
 *
 * `gametime` is nflverse's own convention: `HH:MM` in US Eastern. Not
 * independently verified in this session — flagged the same as the NWS
 * response shape above.
 */
export async function attachWeatherForecasts<T extends WeatherForecastGame>(
  games: readonly T[],
  stadiumCoordinates: Record<string, { lat: number; lon: number }>,
): Promise<T[]> {
  if (!userAgent()) return [...games];

  return Promise.all(
    games.map(async (game) => {
      if (
        game.location !== "Home" ||
        game.homeScore != null ||
        game.roof === "dome" ||
        game.roof === "closed" ||
        game.temperatureF != null ||
        !game.stadiumId
      ) {
        return game;
      }

      const coords = stadiumCoordinates[game.stadiumId];
      if (!coords) return game;

      // nflverse's gametime is documented as US/Eastern; the date-time
      // string is parsed with an explicit -04:00/-05:00-agnostic offset by
      // letting the runtime's Intl machinery resolve "America/New_York" —
      // simpler and safer than hand-picking a fixed UTC offset that would
      // silently drift wrong across the DST boundary.
      const kickoffIso = game.gametime
        ? toEasternIso(game.gameday, game.gametime)
        : `${game.gameday}T18:00:00-05:00`; // no time published yet: a mid-afternoon guess is close enough to land in the right forecast period for a same-day lookup.

      const period = await fetchForecast(coords.lat, coords.lon, kickoffIso).catch(
        () => null,
      );
      if (!period) return game;

      return {
        ...game,
        temperatureF: period.temperatureF,
        windSpeedMph: period.windSpeedMph,
        weatherType: classifyForecast(game.roof, period.temperatureF, period.shortForecast),
      };
    }),
  );
}
