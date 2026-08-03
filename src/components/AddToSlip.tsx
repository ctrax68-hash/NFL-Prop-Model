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
              "flex min-h-[76px] flex-col items-center justify-center rounded-[var(--radius-sm)] border px-3 py-2.5 transition-all duration-200 active:scale-[0.97]",
              selected
                ? "border-transparent"
                : "border-[var(--border)] bg-[rgba(32,26,36,0.6)] hover:border-[var(--border-strong)]",
            )}
            style={
              selected
                ? {
                    background:
                      side === "over"
                        ? "linear-gradient(180deg, var(--gold-bright), var(--gold))"
                        : "linear-gradient(180deg, #8ad8ff, var(--azure))",
                    boxShadow:
                      side === "over"
                        ? "var(--glow-gold)"
                        : "var(--glow-azure)",
                  }
                : undefined
            }
          >
            <span
              className={clsx(
                "eyebrow",
                selected ? "text-[#14100a] opacity-80" : undefined,
              )}
            >
              {side === "over" ? "Over" : "Under"} {props.lineValue}
            </span>
            <span
              className="display mt-0.5 text-xl font-black"
              style={{
                color: selected
                  ? "#14100a"
                  : side === "over"
                    ? "var(--gold)"
                    : "var(--azure)",
              }}
            >
              {formatOdds(odds)}
            </span>
            <span
              className={clsx(
                "numeric mt-0.5 text-[11px]",
                selected ? "text-[#14100a] opacity-75" : "text-[var(--ink-mute)]",
              )}
            >
              model {formatPercent(prob)} · edge {edge > 0 ? "+" : ""}
              {(edge * 100).toFixed(1)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
