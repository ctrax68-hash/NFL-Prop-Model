import { Suspense } from "react";
import Link from "next/link";

import { GlobalSearch } from "@/components/GlobalSearch";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { InjuryBadge, Card, EmptyState, SectionHeading } from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";
import { buildSearchIndex, search } from "@/lib/search";
import { teamLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();

  const snapshot = await getSlate();

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <h1 className="display text-[34px] font-black text-[var(--ink)]">
          SEARCH
        </h1>
        <EmptyState
          title="No slate generated yet"
          body="Run the weekly pipeline first — search looks at the latest slate's players and games."
          command="npx tsx scripts/pipeline.ts --season 2025 --week 12"
        />
      </div>
    );
  }

  const results = q ? search(buildSearchIndex(snapshot), q) : null;

  // Best-edge prop per player, so a name links straight to a priced market
  // when one exists. Rows already sort by edge descending, so the first row
  // seen for a player is their best one.
  const bestPropByPlayer = new Map<string, string>();
  for (const row of buildBoardRows(snapshot)) {
    if (!bestPropByPlayer.has(row.playerId)) {
      bestPropByPlayer.set(row.playerId, row.propId);
    }
  }

  const totalResults = results ? results.players.length + results.games.length : 0;

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="eyebrow text-[var(--ink-dim)]">
          {snapshot.season} · WK {snapshot.week}
        </div>
        <h1 className="display mt-1 text-[28px] font-black text-[var(--ink)] sm:text-[52px]">
          SEARCH
        </h1>
      </header>

      <Suspense fallback={null}>
        <GlobalSearch variant="page" />
      </Suspense>

      {!q ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--ink-dim)]">
            Search for a player or a matchup on the current slate.
          </p>
        </Card>
      ) : totalResults === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--ink-dim)]">
            No matches for &ldquo;{q}&rdquo;.
          </p>
        </Card>
      ) : (
        <>
          {results!.players.length > 0 ? (
            <Card className="p-4">
              <SectionHeading title="Players" />
              <div className="space-y-1.5">
                {results!.players.map((player) => {
                  const propId = bestPropByPlayer.get(player.playerId);
                  return (
                    <Link
                      key={player.playerId}
                      href={
                        propId
                          ? `/prop/${encodeURIComponent(propId)}`
                          : "/schedule"
                      }
                      className="tap flex min-h-[56px] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(32,26,36,0.5)] px-2.5 py-1.5 transition-colors hover:border-[var(--bronze)]"
                    >
                      <PlayerAvatar
                        url={player.headshotUrl}
                        name={player.name}
                        size={32}
                      />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-[var(--ink)]">
                          {player.name}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium text-[var(--ink-mute)]">
                          {player.position} · {teamLabel(player.teamId)}
                        </span>
                        <InjuryBadge status={player.injuryStatus} className="shrink-0" />
                      </span>
                      {!propId ? (
                        <span className="eyebrow shrink-0 text-[var(--ink-mute)]">
                          No priced prop
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {results!.games.length > 0 ? (
            <Card className="p-4">
              <SectionHeading title="Games" />
              <div className="space-y-1.5">
                {results!.games.map((game) => (
                  <Link
                    key={game.gameId}
                    href="/schedule"
                    className="tap flex min-h-[48px] items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(32,26,36,0.5)] px-3 py-1.5 transition-colors hover:border-[var(--bronze)]"
                  >
                    <span className="text-[13px] font-semibold text-[var(--ink)]">
                      {teamLabel(game.awayTeam)}{" "}
                      <span className="text-[var(--ink-mute)]">@</span>{" "}
                      {teamLabel(game.homeTeam)}
                    </span>
                    <span className="eyebrow text-[var(--ink-mute)]">
                      {game.gameday}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
