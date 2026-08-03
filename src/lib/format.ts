/** Display formatting shared across the UI. */

import type { PropType, Side } from "./engine/types";

export const PROP_LABELS: Record<PropType, string> = {
  receiving_yards: "Receiving Yds",
  receptions: "Receptions",
  rushing_yards: "Rushing Yds",
  rush_attempts: "Rush Attempts",
  passing_yards: "Passing Yds",
  pass_attempts: "Pass Attempts",
  pass_completions: "Completions",
};

export const PROP_SHORT: Record<PropType, string> = {
  receiving_yards: "REC YDS",
  receptions: "REC",
  rushing_yards: "RUSH YDS",
  rush_attempts: "CARRIES",
  passing_yards: "PASS YDS",
  pass_attempts: "ATT",
  pass_completions: "CMP",
};

/** American odds always carry an explicit sign on a betting board. */
export function formatOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  const formatted = (value * 100).toFixed(digits);
  return value > 0 ? `+${formatted}%` : `${formatted}%`;
}

export function formatUnits(units: number): string {
  return `${units.toFixed(2)}u`;
}

export function formatSignedUnits(units: number): string {
  return `${units > 0 ? "+" : ""}${units.toFixed(2)}u`;
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatStat(value: number, propType: PropType): string {
  const isCount =
    propType === "receptions" ||
    propType === "rush_attempts" ||
    propType === "pass_attempts" ||
    propType === "pass_completions";
  return isCount ? value.toFixed(1) : value.toFixed(1);
}

export function sideLabel(side: Side): string {
  return side === "over" ? "Over" : "Under";
}

/** Colour token for an edge value, used for badges. */
export function edgeTone(edge: number): "strong" | "good" | "flat" | "bad" {
  if (edge >= 0.08) return "strong";
  if (edge >= 0.03) return "good";
  if (edge >= 0) return "flat";
  return "bad";
}

export function teamLabel(teamId: string): string {
  return teamId.toUpperCase();
}

/** "CIN @ BAL" from the game id nflverse uses. */
export function matchupLabel(
  homeTeam: string,
  awayTeam: string,
  playerTeam: string,
): string {
  return playerTeam === homeTeam
    ? `vs ${teamLabel(awayTeam)}`
    : `@ ${teamLabel(homeTeam)}`;
}
