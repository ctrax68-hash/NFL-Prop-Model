/**
 * Live score and in-progress player stats for one game, from ESPN's public
 * API (see the verification caveat in `src/lib/live/espn.ts`).
 *
 * Read-only, unauthenticated, display-only — this never touches the
 * projection engine or the stored slate. Cached for 10s per game so a
 * roomful of viewers polling the same game doesn't multiply into that many
 * ESPN requests, and short enough to still feel live.
 */

import { NextResponse } from "next/server";

import { fetchLiveGame } from "@/lib/live/espn";

export const revalidate = 10;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const { gameId } = await params;

  try {
    const live = await fetchLiveGame(gameId);
    if (!live) {
      return NextResponse.json({ error: "No live data for this game." }, { status: 404 });
    }
    return NextResponse.json(live);
  } catch {
    // ESPN's endpoint is unofficial and can fail or change shape without
    // notice; the Schedule tab should just show no live badge, not an error.
    return NextResponse.json({ error: "Live data unavailable." }, { status: 502 });
  }
}
