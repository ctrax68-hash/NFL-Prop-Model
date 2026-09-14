"use client";

import { useEffect, useState } from "react";

import type { LiveGameResponse } from "./types";

const POLL_MS = 20_000;

export interface LiveGameTarget {
  gameId: string;
  kickoffAt: string | null;
  finished: boolean;
}

/**
 * `useLiveGame` polls one game because `ScheduleGameCard` renders one card
 * per game. The Edges tab (`PropBoard`) is one flat list across every game
 * on the slate — up to 16 at once — so a naive per-row `useLiveGame` would
 * open that many independent polling loops. This polls a whole *set* of
 * games from one hook call instead, using the identical eligibility rule
 * (past kickoff, not yet finished, stopped individually once ESPN calls that
 * game post) applied per entry rather than once, so the number of games
 * actually polled concurrently stays small regardless of slate size.
 *
 * Same failure behaviour as `useLiveGame`: a failed poll keeps that game's
 * last known state rather than clearing it.
 */
export function useLiveGames(games: readonly LiveGameTarget[]): Map<string, LiveGameResponse> {
  const [state, setState] = useState<Map<string, LiveGameResponse>>(new Map());

  const eligible = games.filter((g) => {
    if (g.finished || !g.kickoffAt) return false;
    return Date.now() >= new Date(g.kickoffAt).getTime();
  });
  // Only the *set* of eligible game ids should restart polling — `games`
  // itself is typically a fresh array/object from the caller every render.
  const signature = eligible
    .map((g) => g.gameId)
    .sort()
    .join(",");

  useEffect(() => {
    if (eligible.length === 0) return;

    let cancelled = false;
    const timers = new Map<string, ReturnType<typeof setInterval>>();

    const poll = async (gameId: string) => {
      try {
        const res = await fetch(`/api/live/${encodeURIComponent(gameId)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LiveGameResponse;
        if (cancelled) return;
        setState((prev) => {
          const next = new Map(prev);
          next.set(gameId, data);
          return next;
        });
        if (data.game.status === "post") {
          const timer = timers.get(gameId);
          if (timer) {
            clearInterval(timer);
            timers.delete(gameId);
          }
        }
      } catch {
        // Keep the last known state for this game.
      }
    };

    for (const game of eligible) {
      poll(game.gameId);
      timers.set(
        game.gameId,
        setInterval(() => {
          if (document.visibilityState === "visible") poll(game.gameId);
        }, POLL_MS),
      );
    }

    return () => {
      cancelled = true;
      for (const timer of timers.values()) clearInterval(timer);
    };
    // `signature` is the real dependency — it only changes when the eligible
    // game-id set actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return state;
}
