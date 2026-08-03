/**
 * The Odds API provider — real sportsbook player props.
 *
 * Enable with `PROPS_PROVIDER=odds-api` and `ODDS_API_KEY=...`.
 *
 * NOTE ON VERIFICATION: this is written against The Odds API v4 request and
 * response shapes, but it has NOT been exercised against the live service —
 * the environment this was built in blocks outbound requests to
 * api.the-odds-api.com, and the endpoint requires a paid key. Treat the field
 * mapping as unverified until it has run against a real key once. The parsing
 * is defensive and `parseEventOdds` is unit-tested against a captured-shape
 * fixture, so a shape mismatch will surface as skipped props rather than
 * silently wrong lines.
 */

import type { PropLine, PropType } from "../../engine/types";
import type { PropsProvider, PropsProviderContext } from "./provider";

const API_BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "americanfootball_nfl";

/** The Odds API market keys mapped onto the engine's prop types. */
export const MARKET_KEY_TO_PROP_TYPE: Record<string, PropType> = {
  player_pass_yds: "passing_yards",
  player_pass_attempts: "pass_attempts",
  player_pass_completions: "pass_completions",
  player_rush_yds: "rushing_yards",
  player_rush_attempts: "rush_attempts",
  player_reception_yds: "receiving_yards",
  player_receptions: "receptions",
};

export interface OddsApiOptions {
  apiKey: string;
  /** Comma-separated bookmaker keys, e.g. "draftkings,fanduel". */
  bookmakers: string;
  regions: string;
}

interface OddsApiOutcome {
  name: string;
  description?: string;
  price: number;
  point?: number;
}

interface OddsApiMarket {
  key: string;
  last_update?: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: OddsApiMarket[];
}

export interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
}

export interface NameResolver {
  /** Map a sportsbook player name onto an nflverse player id. */
  resolve(name: string): string | null;
}

/**
 * Turn one event's odds payload into prop lines.
 *
 * Exported separately from the fetch so it can be tested without a network
 * call — the field mapping is the part most likely to be wrong.
 */
export function parseEventOdds(
  event: OddsApiEvent,
  gameId: string,
  resolver: NameResolver,
): PropLine[] {
  const props: PropLine[] = [];

  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      const propType = MARKET_KEY_TO_PROP_TYPE[market.key];
      if (!propType) continue;

      // Player props arrive as one outcome per side, with the player in
      // `description`. Pair them up by player and point.
      const byPlayer = new Map<
        string,
        { over?: OddsApiOutcome; under?: OddsApiOutcome }
      >();

      for (const outcome of market.outcomes ?? []) {
        const playerName = outcome.description;
        if (!playerName || outcome.point == null) continue;

        const key = `${playerName}|${outcome.point}`;
        let pair = byPlayer.get(key);
        if (!pair) {
          pair = {};
          byPlayer.set(key, pair);
        }
        if (outcome.name === "Over") pair.over = outcome;
        else if (outcome.name === "Under") pair.under = outcome;
      }

      for (const [key, pair] of byPlayer) {
        if (!pair.over || !pair.under) continue;

        const playerName = key.split("|")[0];
        const playerId = resolver.resolve(playerName);
        if (!playerId) continue;

        props.push({
          propId: `${gameId}|${playerId}|${propType}|${bookmaker.key}`,
          gameId,
          playerId,
          propType,
          lineValue: pair.over.point!,
          oddsOverAmerican: pair.over.price,
          oddsUnderAmerican: pair.under.price,
          bookName: bookmaker.key,
          timestamp: market.last_update ?? new Date().toISOString(),
        });
      }
    }
  }

  return props;
}

export class OddsApiPropsProvider implements PropsProvider {
  readonly name = "odds-api";
  readonly isReal = true;

  constructor(
    private readonly options: OddsApiOptions,
    private readonly resolver: NameResolver,
    /** Map an Odds API event onto an nflverse game id. */
    private readonly matchGame: (event: OddsApiEvent) => string | null,
  ) {}

  async fetchProps(context: PropsProviderContext): Promise<PropLine[]> {
    const events = await this.listEvents();
    const markets = Object.keys(MARKET_KEY_TO_PROP_TYPE).join(",");
    const props: PropLine[] = [];

    // Player props are per-event on this API; there is no slate-wide endpoint.
    for (const event of events) {
      const gameId = this.matchGame(event);
      if (!gameId) continue;

      const url = new URL(
        `${API_BASE}/sports/${SPORT_KEY}/events/${event.id}/odds`,
      );
      url.searchParams.set("apiKey", this.options.apiKey);
      url.searchParams.set("regions", this.options.regions);
      url.searchParams.set("markets", markets);
      url.searchParams.set("oddsFormat", "american");
      if (this.options.bookmakers) {
        url.searchParams.set("bookmakers", this.options.bookmakers);
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `The Odds API returned ${response.status} for event ${event.id}: ${await response.text()}`,
        );
      }

      const payload = (await response.json()) as OddsApiEvent;
      props.push(...parseEventOdds(payload, gameId, this.resolver));
    }

    void context;
    return props;
  }

  private async listEvents(): Promise<OddsApiEvent[]> {
    const url = new URL(`${API_BASE}/sports/${SPORT_KEY}/events`);
    url.searchParams.set("apiKey", this.options.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `The Odds API returned ${response.status} listing events: ${await response.text()}`,
      );
    }
    return (await response.json()) as OddsApiEvent[];
  }
}

/**
 * Resolve sportsbook player names against nflverse ids.
 * Books write "Ja'Marr Chase"; nflverse agrees, but punctuation, suffixes and
 * casing drift enough that an exact match drops real players.
 */
export function createNameResolver(
  players: ReadonlyMap<string, { name: string; teamId: string }>,
): NameResolver {
  const index = new Map<string, string>();
  for (const [playerId, player] of players) {
    index.set(normaliseName(player.name), playerId);
  }
  return {
    resolve(name: string) {
      return index.get(normaliseName(name)) ?? null;
    },
  };
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z]/g, "");
}
