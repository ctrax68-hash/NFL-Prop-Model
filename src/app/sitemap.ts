import type { MetadataRoute } from "next";

import { buildBoardRows, getSlate, listSlates } from "@/lib/data";
import { gameSlug, playerSlug, siteUrl } from "@/lib/seo";

// Regenerated at most every 30 minutes. Unlike the player/game pages this
// links to (which turned out to render fully dynamically — see their doc
// comments), this file is a metadata route rather than a React page, so it
// never passes through the root layout and this revalidate export actually
// takes effect: confirmed via a production build, where /sitemap.xml alone
// showed a real Revalidate/Expire entry.
export const revalidate = 1800;

const STATIC_ROUTES = ["", "/schedule", "/methodology", "/backtest"];

/** How many of the most recent weeks' players/games to list — six seasons of
 * every player who ever appeared would make the sitemap enormous for no real
 * SEO benefit; recent, still-relevant slates are what's worth indexing. */
const RECENT_SLATE_COUNT = 6;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
  }));

  const slates = (await listSlates()).slice(0, RECENT_SLATE_COUNT);
  const snapshots = await Promise.all(
    slates.map((s) => getSlate(s.season, s.week)),
  );

  const seenPlayers = new Set<string>();
  const seenGames = new Set<string>();

  for (const snapshot of snapshots) {
    if (!snapshot) continue;

    for (const game of snapshot.games) {
      if (seenGames.has(game.gameId)) continue;
      seenGames.add(game.gameId);
      entries.push({
        url: `${base}/games/${gameSlug(game.gameId)}`,
        lastModified: new Date(snapshot.generatedAt),
      });
    }

    // Only players with at least one priced market this week — a player
    // with no market is a page with nothing but a game log, not worth a
    // dedicated indexed URL.
    const pricedPlayerIds = new Set(
      buildBoardRows(snapshot).map((row) => row.playerId),
    );
    for (const player of snapshot.players) {
      if (!pricedPlayerIds.has(player.playerId)) continue;
      if (seenPlayers.has(player.playerId)) continue;
      seenPlayers.add(player.playerId);
      entries.push({
        url: `${base}/players/${playerSlug(player.name, player.playerId)}`,
        lastModified: new Date(snapshot.generatedAt),
      });
    }
  }

  return entries;
}
