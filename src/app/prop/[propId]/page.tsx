import Link from "next/link";
import { notFound } from "next/navigation";

import { DistributionChart } from "@/components/charts";
import { AddToSlip } from "@/components/AddToSlip";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EdgeMeter } from "@/components/EdgeMeter";
import { Card, EdgeBadge, SectionHeading, SyntheticWarning } from "@/components/ui";
import { getSlate } from "@/lib/data";
import { densityCurve } from "@/lib/engine/distribution";
import { isDiscreteStat } from "@/lib/engine/types";
import {
  PROP_LABELS,
  formatPercent,
  formatSignedPercent,
  formatUnits,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ propId: string }>;
  searchParams: Promise<{ season?: string; week?: string }>;
}) {
  const { propId: rawPropId } = await params;
  const propId = decodeURIComponent(rawPropId);
  const query = await searchParams;

  const snapshot = await getSlate(
    query.season ? Number(query.season) : undefined,
    query.week ? Number(query.week) : undefined,
  );
  if (!snapshot) notFound();

  const evaluation = snapshot.evaluations.find((e) => e.propId === propId);
  const prop = snapshot.props.find((p) => p.propId === propId);
  if (!evaluation || !prop) notFound();

  const player = snapshot.players.find((p) => p.playerId === evaluation.playerId);
  const game = snapshot.games.find((g) => g.gameId === evaluation.gameId);
  const projection = snapshot.projections.find(
    (p) => p.playerId === evaluation.playerId && p.gameId === evaluation.gameId,
  );
  if (!player || !game || !projection) notFound();

  const recommendation = snapshot.recommendations.find(
    (r) => r.propId === propId,
  );
  const bestSide = evaluation.edgeOver >= evaluation.edgeUnder ? "over" : "under";

  const points = densityCurve(
    {
      stat: evaluation.propType,
      mean: evaluation.projectedValue,
      sigma: evaluation.sigma,
    },
    snapshot.config,
  );

  const logs = snapshot.gameLogs
    .filter((entry) => entry.playerId === evaluation.playerId)
    .slice(0, 8)
    .reverse();

  const isHome = player.teamId === game.homeTeam;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const teamSpread = isHome ? game.spreadHome : -game.spreadHome;
  const impliedTotal = isHome
    ? game.impliedTeamTotalHome
    : game.impliedTeamTotalAway;

  const isReceiving =
    evaluation.propType === "receiving_yards" ||
    evaluation.propType === "receptions";
  const isRushing =
    evaluation.propType === "rushing_yards" ||
    evaluation.propType === "rush_attempts";

  const chain: Array<{ label: string; value: string; note?: string }> = [
    {
      label: "Team plays",
      value: projection.breakdown.teamPlays.toFixed(1),
      note: `pace + total ${game.total} + spread ${teamSpread > 0 ? "+" : ""}${teamSpread}`,
    },
    {
      label: "Pass rate",
      value: formatPercent(projection.breakdown.passRate),
      note: "after game-script adjustment",
    },
  ];

  if (isReceiving) {
    chain.push(
      {
        label: "Team pass attempts",
        value: projection.breakdown.teamPassAttempts.toFixed(1),
      },
      {
        label: "Target share",
        value: formatPercent(projection.breakdown.targetShare),
        note: "shrunk toward positional prior",
      },
      {
        label: "Projected targets",
        value: projection.projectedTargets.toFixed(1),
      },
    );
    if (evaluation.propType === "receiving_yards") {
      chain.push({
        label: "Yards per target",
        value: projection.breakdown.yardsPerTarget.toFixed(2),
        note: `vs ${opponent} defense ×${projection.breakdown.defenseMultiplierReceiving.toFixed(3)}`,
      });
    } else {
      chain.push({
        label: "Catch rate",
        value: formatPercent(projection.breakdown.catchRate),
      });
    }
  } else if (isRushing) {
    chain.push(
      {
        label: "Team rush attempts",
        value: projection.breakdown.teamRushAttempts.toFixed(1),
      },
      {
        label: "Rush share",
        value: formatPercent(projection.breakdown.rushShare),
      },
      {
        label: "Projected carries",
        value: projection.projectedCarries.toFixed(1),
      },
    );
    if (evaluation.propType === "rushing_yards") {
      chain.push({
        label: "Yards per carry",
        value: projection.breakdown.yardsPerCarry.toFixed(2),
      });
    }
  } else {
    chain.push({
      label: "Projected pass attempts",
      value: projection.projectedPassAttempts.toFixed(1),
    });
  }

  chain.push({
    label: "Projection",
    value: evaluation.projectedValue.toFixed(1),
    note: `σ ${evaluation.sigma.toFixed(1)} · ${evaluation.distribution}`,
  });

  const logMax = Math.max(
    evaluation.lineValue,
    ...logs.map((entry) => entry.values[evaluation.propType] ?? 0),
    1,
  );

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="-ml-2 inline-flex min-h-[40px] items-center gap-1 px-2 text-xs text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]"
      >
        ← Back to board
      </Link>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <PlayerAvatar url={player.headshotUrl} name={player.name} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="display truncate text-[22px] font-black text-[var(--ink)]">
              {player.name}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--ink-mute)]">
              {player.position} · {player.teamId} {isHome ? "vs" : "@"} {opponent}
              {" · "}
              {PROP_LABELS[evaluation.propType]} {evaluation.lineValue}
            </p>
            <p className="mt-1 text-[11px] text-[var(--ink-mute)]">
              Implied team total {impliedTotal.toFixed(1)} · {game.weatherType}
              {game.windSpeedMph != null ? ` · ${game.windSpeedMph} mph wind` : ""}
              {" · "}
              {player.gamesSampleN} games of history
            </p>
          </div>
          <div className="hidden shrink-0 sm:block">
            <EdgeMeter
              edge={
                bestSide === "over" ? evaluation.edgeOver : evaluation.edgeUnder
              }
              size={116}
            />
          </div>
          <div className="shrink-0 sm:hidden">
            <EdgeBadge
              edge={
                bestSide === "over" ? evaluation.edgeOver : evaluation.edgeUnder
              }
            />
          </div>
        </div>

        <AddToSlip
          propId={propId}
          season={snapshot.season}
          week={snapshot.week}
          gameId={evaluation.gameId}
          playerId={player.playerId}
          playerName={player.name}
          teamId={player.teamId}
          propType={evaluation.propType}
          lineValue={evaluation.lineValue}
          oddsOverAmerican={prop.oddsOverAmerican}
          oddsUnderAmerican={prop.oddsUnderAmerican}
          modelProbOver={evaluation.modelProbOverNoPush}
          modelProbUnder={evaluation.modelProbUnderNoPush}
          fairProbOver={evaluation.fairProbOver}
          fairProbUnder={evaluation.fairProbUnder}
          edgeOver={evaluation.edgeOver}
          edgeUnder={evaluation.edgeUnder}
          suggestedUnits={recommendation?.kelly.recommendedUnits ?? 0.25}
        />
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Modelled distribution"
          hint={`The shaded region is where ${bestSide === "over" ? "the over" : "the under"} wins.`}
        />
        <DistributionChart
          points={points}
          line={evaluation.lineValue}
          projection={evaluation.projectedValue}
          winningSide={bestSide}
          discrete={isDiscreteStat(evaluation.propType)}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <SectionHeading
            title="How the projection is built"
            hint="Team volume down to a single player's expected output."
          />
          <ol className="space-y-1.5">
            {chain.map((step, index) => (
              <li
                key={step.label}
                className={
                  index === chain.length - 1
                    ? "flex items-baseline justify-between gap-3 border-t pt-2.5"
                    : "flex items-baseline justify-between gap-3"
                }
              >
                <span className="min-w-0">
                  <span
                    className={
                      index === chain.length - 1
                        ? "text-sm font-bold text-[var(--ink)]"
                        : "text-sm text-[var(--ink-dim)]"
                    }
                  >
                    {step.label}
                  </span>
                  {step.note ? (
                    <span className="block text-[11px] text-[var(--ink-mute)]">
                      {step.note}
                    </span>
                  ) : null}
                </span>
                <span
                  className={
                    index === chain.length - 1
                      ? "numeric shrink-0 text-base font-bold"
                      : "numeric shrink-0 text-sm font-medium"
                  }
                >
                  {step.value}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-4">
          <SectionHeading
            title="Pricing"
            hint="Edge is measured against the de-vigged fair price."
          />
          <dl className="space-y-1.5 text-sm">
            {[
              ["Model P(over)", formatPercent(evaluation.modelProbOverNoPush, 2)],
              ["Model P(under)", formatPercent(evaluation.modelProbUnderNoPush, 2)],
              ["Book implied (over)", formatPercent(evaluation.rawImpliedOver, 2)],
              ["Book fair (over)", formatPercent(evaluation.fairProbOver, 2)],
              ["Overround", `${evaluation.overround.toFixed(4)}`],
              ["Edge over", formatSignedPercent(evaluation.edgeOver, 2)],
              ["Edge under", formatSignedPercent(evaluation.edgeUnder, 2)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-[var(--ink-dim)]">{label}</dt>
                <dd className="numeric font-semibold text-[var(--ink)]">{value}</dd>
              </div>
            ))}
            {evaluation.modelProbPush > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-dim)]">Push probability</dt>
                <dd className="numeric font-semibold text-[var(--ink)]">
                  {formatPercent(evaluation.modelProbPush, 2)}
                </dd>
              </div>
            ) : null}
            {recommendation ? (
              <div className="mt-2 flex justify-between gap-3 border-t pt-2.5">
                <dt className="font-semibold">Kelly stake</dt>
                <dd className="display text-base font-black text-[var(--mint)] glow-mint">
                  {formatUnits(recommendation.kelly.recommendedUnits)}
                </dd>
              </div>
            ) : (
              <p className="mt-2 border-t pt-2.5 text-[11px] text-[var(--ink-mute)]">
                Not recommended — below the {formatPercent(snapshot.config.selection.minEdge)}{" "}
                edge threshold or filtered on data quality.
              </p>
            )}
          </dl>
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeading
          title="Recent games"
          hint={`Last ${logs.length} results against the current line of ${evaluation.lineValue}.`}
        />
        {logs.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">
            No prior games in the loaded history.
          </p>
        ) : (
          <div className="scroll-x">
            <div className="flex min-w-fit items-end gap-2.5">
              {logs.map((entry) => {
                const value = entry.values[evaluation.propType] ?? 0;
                const cleared = value > evaluation.lineValue;
                const heightPct = Math.max(4, (value / logMax) * 100);
                return (
                  <div
                    key={`${entry.season}-${entry.week}`}
                    className="flex w-14 shrink-0 flex-col items-center gap-1"
                  >
                    <span className="numeric text-[11px] font-semibold text-[var(--ink)]">
                      {value.toFixed(0)}
                    </span>
                    <div className="relative flex h-24 w-full items-end">
                      {/* The line, drawn across the strip. */}
                      <div
                        className="absolute inset-x-0 z-10 border-t-2 border-dashed border-[var(--marker)]/70"
                        style={{
                          bottom: `${Math.min(100, (evaluation.lineValue / logMax) * 100)}%`,
                        }}
                      />
                      <div
                        className="w-full rounded-t-[4px]"
                        style={{
                          height: `${heightPct}%`,
                          background: cleared
                            ? "linear-gradient(180deg, var(--gold-bright), var(--bronze))"
                            : "var(--obsidian-3)",
                          boxShadow: cleared
                            ? "0 0 10px rgba(255,194,75,0.3)"
                            : undefined,
                        }}
                        title={`${entry.season} wk ${entry.week} vs ${entry.opponent}: ${value}`}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--ink-mute)]">
                      W{entry.week}
                    </span>
                    <span className="text-[10px] text-[var(--ink-mute)]">
                      {entry.opponent}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-[var(--ink-mute)]">
          Filled bars cleared the current line. The dashed rule is{" "}
          {evaluation.lineValue}.
        </p>
      </Card>
    </div>
  );
}
