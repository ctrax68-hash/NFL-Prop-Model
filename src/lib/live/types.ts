import type { PropType } from "../engine/types";

export type LiveGameStatus = "pre" | "in" | "post";

export interface LiveGameState {
  status: LiveGameStatus;
  /** ESPN's own phrasing, e.g. "8:42 - 3rd Quarter", "Halftime", "Final" — not reconstructed from period/clock, so it can't drift from what ESPN's broadcast graphics say. */
  detail: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface LivePlayerLine {
  /** normaliseName(name) — the join key against a BoardRow's playerName. */
  key: string;
  name: string;
  team: string;
  stats: Partial<Record<PropType, number>>;
}

export interface LiveGameResponse {
  game: LiveGameState;
  players: LivePlayerLine[];
}
