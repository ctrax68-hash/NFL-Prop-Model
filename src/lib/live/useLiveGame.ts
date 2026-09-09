"use client";

import { useEffect, useState } from "react";

import type { LiveGameResponse } from "./types";

const POLL_MS = 20_000;

/**
 * Polls `/api/live/[gameId]` while a game is plausibly in progress, and
 * stops once ESPN itself calls it final. Does nothing before kickoff (no
 * live data exists yet) or once the pipeline's own actuals mark the game
 * finished — at that point the stored score is the one everything else on
 * the page already shows.
 *
 * A failed poll keeps the last known state rather than clearing it — a
 * transient miss against an unofficial endpoint shouldn't flicker a score
 * that was just on screen.
 */
export function useLiveGame({
  gameId,
  kickoffAt,
  finished,
}: {
  gameId: string;
  kickoffAt: string | null;
  finished: boolean;
}): LiveGameResponse | null {
  const [state, setState] = useState<LiveGameResponse | null>(null);

  useEffect(() => {
    if (finished || !kickoffAt) return;
    if (Date.now() < new Date(kickoffAt).getTime()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/live/${encodeURIComponent(gameId)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LiveGameResponse;
        if (cancelled) return;
        setState(data);
        if (data.game.status === "post" && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        // Keep the last known state.
      }
    };

    poll();
    timer = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [gameId, kickoffAt, finished]);

  return state;
}
