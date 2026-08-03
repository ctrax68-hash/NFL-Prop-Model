"use client";

import clsx from "clsx";

import type { PropType, Side } from "@/lib/engine/types";
import { formatOdds, formatPercent } from "@/lib/format";
import { useBetSlip, type SlipLeg } from "./BetSlipProvider";

/** Both prices for one prop, as large tappable buttons on the detail page. */
export function AddToSlip(props: {
  propId: string;
  season: number;
  week: number;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  propType: PropType;
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
  modelProbOver: number;
  modelProbUnder: number;
  fairProbOver: number;
  fairProbUnder: number;
  edgeOver: number;
  edgeUnder: number;
  suggestedUnits: number;
}) {
  const slip = useBetSlip();

  const makeLeg = (side: Side): SlipLeg => ({
    propId: props.propId,
    season: props.season,
    week: props.week,
    gameId: props.gameId,
    playerId: props.playerId,
    playerName: props.playerName,
    teamId: props.teamId,
    propType: props.propType,
    lineValue: props.lineValue,
    side,
    oddsAmerican:
      side === "over" ? props.oddsOverAmerican : props.oddsUnderAmerican,
    modelProb: side === "over" ? props.modelProbOver : props.modelProbUnder,
    fairProb: side === "over" ? props.fairProbOver : props.fairProbUnder,
    edge: side === "over" ? props.edgeOver : props.edgeUnder,
    suggestedUnits: props.suggestedUnits,
    units: props.suggestedUnits,
  });

  const sides: Array<{
    side: Side;
    odds: number;
    prob: number;
    edge: number;
  }> = [
    {
      side: "over",
      odds: props.oddsOverAmerican,
      prob: props.modelProbOver,
      edge: props.edgeOver,
    },
    {
      side: "under",
      odds: props.oddsUnderAmerican,
      prob: props.modelProbUnder,
      edge: props.edgeUnder,
    },
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {sides.map(({ side, odds, prob, edge }) => {
        const selected = slip.has(props.propId, side);
        return (
          <button
            key={side}
            type="button"
            onClick={() => slip.toggle(makeLeg(side))}
            aria-pressed={selected}
            className={clsx(
              "flex min-h-[64px] flex-col items-center justify-center rounded-[var(--radius-sm)] border px-3 py-2 transition-colors",
              selected
                ? "border-transparent bg-[var(--accent)] text-[var(--accent-ink)]"
                : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
            )}
          >
            <span
              className={clsx(
                "text-[11px] font-semibold tracking-wide uppercase",
                selected ? "opacity-80" : "text-[var(--text-muted)]",
              )}
            >
              {side === "over" ? "Over" : "Under"} {props.lineValue}
            </span>
            <span className="tnum text-lg font-bold">{formatOdds(odds)}</span>
            <span
              className={clsx(
                "tnum text-[11px]",
                selected ? "opacity-80" : "text-[var(--text-muted)]",
              )}
            >
              model {formatPercent(prob)} · edge{" "}
              {edge > 0 ? "+" : ""}
              {(edge * 100).toFixed(1)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
