import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PickRow } from "@/components/PickRow";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, InjuryBadge, SectionHeading } from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";
import { PROP_LABELS, teamLabel } from "@/lib/format";
import { playerIdFromSlug, playerSlug, siteUrl } from "@/lib/seo";
import type { Position, PropType } from "@/lib/engine/types";
import type { PlayerGameLogEntry } from "@/lib/pipeline/types";

// NOT actually ISR, despite the original intent — verified by hitting a
// built production server and reading the response's Cache-Control header,
// which came back `private, no-cache, no-store, must-revalidate` (the
// signature of a fully dynamic render) regardless of a `revalidate` export
// here. The root layout's `getCurrentUser()` reads `cookies()` on every
// request (`src/lib/supabase/server.ts`), and Next's App Router bails an
// entire route to dynamic rendering the moment anything in its layout tree
// touches a dynamic API — a page cannot opt back into static/ISR under a
// dynamic layout. Real ISR here would need Partial Prerendering (still
// experimental) or moving the auth-dependent nav out of the server-rendered
// layout entirely; both are bigger changes than this page justifies on
// their own. `force-dynamic` documents what's actually happening instead of
// leaving a revalidate export that silently does nothing.
export const dynamic = "force-dynamic";

/** Which of a player's stats are worth a column, by position. */
const POSITION_STATS: Record<Position, PropType[]> = {
  QB: ["passing_yards", "pass_completions", "pass_attempts", "rushing_yards"],
  RB: ["rushing_yards", "rush_attempts", "receiving_yards", "receptions"],
  WR: ["receiving_yards", "receptions", "rushing_yards"],
  TE: ["receiving_yards", "receptions"],
};

async function loadPlayer(slug: string) {
  const playerId = playerIdFromSlug(slug);
  if (!playerId) return null;

  const snapshot = await getSlate();
  if (!snapshot) return null;

  const player = snapshot.players.find((p) => p.playerId === playerId);
  if (!player) return null;

  return { snapshot, player, playerId };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadPlayer(slug);
  if (!found) return {};

  const { player } = found;
  const title = `${player.name} — ${player.position}, ${teamLabel(player.teamId)} Props & Projections`;
  const description = `Model projections, priced props and recent game log for ${player.name} (${player.position}, ${teamLabel(player.teamId)}).`;

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl()}/players/${playerSlug(player.name, player.playerId)}` },
    openGraph: {
      title,
      description,
      images: player.headshotUrl ? [player.headshotUrl] : undefined,
    },
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await loadPlayer(slug);
  if (!found) notFound();
  const { snapshot, player, playerId } = found;

  // Only the trailing id in the slug is load-bearing (see playerIdFromSlug) —
  // a stale or hand-typed name prefix still resolves to the right player.
  const rows = buildBoardRows(snapshot).filter((r) => r.playerId === playerId);
  const game = snapshot.games.find(
    (g) => g.homeTeam === player.teamId || g.awayTeam === player.teamId,
  );
  const opponent =
    game && (game.homeTeam === player.teamId ? game.awayTeam : game.homeTeam);

  const logs: PlayerGameLogEntry[] = snapshot.gameLogs
    .filter((entry) => entry.playerId === playerId)
    .slice(0, 8)
    .reverse();

  const statColumns = POSITION_STATS[player.position];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar url={player.headshotUrl} name={player.name} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="display flex flex-wrap items-center gap-2 text-[22px] font-black text-[var(--ink)]">
              {player.name}
              <InjuryBadge status={player.injuryStatus} />
            </h1>
            <p className="mt-0.5 text-xs text-[var(--ink-mute)]">
              {player.position} · {teamLabel(player.teamId)}
              {opponent ? ` · ${game!.homeTeam === player.teamId ? "vs" : "@"} ${teamLabel(opponent)}` : ""}
              {" · "}
              {player.gamesSampleN} games of history
            </p>
          </div>
        </div>
      </Card>

      {rows.length > 0 ? (
        <Card className="p-4">
          <SectionHeading
            title={`Week ${snapshot.week} props`}
            hint={`${snapshot.season} · every market currently priced for ${player.name}.`}
          />
          <div className="space-y-1.5">
            {rows.map((row) => (
              <PickRow key={row.propId} row={row} subtitle={PROP_LABELS[row.propType]} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <SectionHeading
          title="Recent games"
          hint={`Last ${logs.length} regular-season games in the loaded history.`}
        />
        {logs.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">
            No prior games in the loaded history.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-mute)]">
                  <th className="py-1.5 font-medium">Week</th>
                  <th className="py-1.5 font-medium">Opp</th>
                  {statColumns.map((stat) => (
                    <th key={stat} className="py-1.5 text-right font-medium">
                      {PROP_LABELS[stat]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={`${entry.season}-${entry.week}`} className="border-t">
                    <td className="numeric py-1.5">
                      {entry.season} WK{entry.week}
                    </td>
                    <td className="py-1.5">{entry.opponent}</td>
                    {statColumns.map((stat) => (
                      <td key={stat} className="numeric py-1.5 text-right">
                        {entry.values[stat] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Link
        href="/schedule"
        className="tap inline-flex min-h-[40px] items-center gap-1 px-2 text-xs text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]"
      >
        ← Back to this week&apos;s schedule
      </Link>
    </div>
  );
}
