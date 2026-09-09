import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PickRow } from "@/components/PickRow";
import { Card, SectionHeading, WeatherBadge } from "@/components/ui";
import { buildBoardRows, getSlate, slateKeyForProp } from "@/lib/data";
import { teamLabel } from "@/lib/format";
import { gameSlug, siteUrl } from "@/lib/seo";

// Same as the player pages — see that file's comment. The root layout's
// cookie read forces every route dynamic regardless of a revalidate export.
export const dynamic = "force-dynamic";

async function loadGame(slug: string) {
  // A game id always leads with `<season>_<week>_`, the same trick
  // `slateKeyForProp` already uses for prop ids (which also lead with a
  // game id) — no separate parser needed.
  const key = slateKeyForProp(slug);
  if (!key) return null;

  const snapshot = await getSlate(key.season, key.week);
  if (!snapshot) return null;

  const game = snapshot.games.find((g) => g.gameId === slug);
  if (!game) return null;

  return { snapshot, game };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadGame(slug);
  if (!found) return {};

  const { game } = found;
  const title = `${teamLabel(game.awayTeam)} @ ${teamLabel(game.homeTeam)} — Week ${game.week} Player Props`;
  const description = `Model projections and priced player props for ${teamLabel(game.awayTeam)} at ${teamLabel(game.homeTeam)}, ${game.season} week ${game.week}.`;

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl()}/games/${gameSlug(game.gameId)}` },
  };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await loadGame(slug);
  if (!found) notFound();
  const { snapshot, game } = found;

  const picks = buildBoardRows(snapshot)
    .filter((row) => row.gameId === game.gameId)
    .sort((a, b) => b.bestEdge - a.bestEdge);

  const finished = game.homeScore != null && game.awayScore != null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="display text-[22px] font-black text-[var(--ink)]">
            {teamLabel(game.awayTeam)}{" "}
            <span className="text-[var(--ink-mute)]">@</span>{" "}
            {teamLabel(game.homeTeam)}
          </h1>
          <WeatherBadge
            weatherType={game.weatherType}
            windSpeedMph={game.windSpeedMph}
            temperatureF={game.temperatureF}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          {game.season} · Week {game.week} · {game.gameday}
          {finished ? ` · FINAL ${game.awayScore}-${game.homeScore}` : ""}
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-mute)]">
          Implied total {teamLabel(game.awayTeam)} {game.impliedTeamTotalAway.toFixed(1)} ·{" "}
          {teamLabel(game.homeTeam)} {game.impliedTeamTotalHome.toFixed(1)} · spread{" "}
          {game.spreadHome > 0 ? "+" : ""}
          {game.spreadHome} ({teamLabel(game.homeTeam)})
        </p>
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Priced props"
          hint={`${picks.length} market${picks.length === 1 ? "" : "s"}, highest edge first.`}
        />
        {picks.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">
            No priced props for this game.
          </p>
        ) : (
          <div className="space-y-1.5">
            {picks.map((row) => (
              <PickRow key={row.propId} row={row} finished={finished} />
            ))}
          </div>
        )}
      </Card>

      <Link
        href={`/schedule?season=${game.season}&week=${game.week}`}
        className="tap inline-flex min-h-[40px] items-center gap-1 px-2 text-xs text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]"
      >
        ← Back to Week {game.week}
      </Link>
    </div>
  );
}
