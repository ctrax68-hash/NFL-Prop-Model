import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/data";

const PROP_TYPE = z.enum([
  "receiving_yards",
  "receptions",
  "rushing_yards",
  "rush_attempts",
  "passing_yards",
  "pass_attempts",
  "pass_completions",
]);

const watchSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  propType: PROP_TYPE,
  season: z.number().int(),
  week: z.number().int(),
  playerName: z.string().min(1),
  teamId: z.string().min(1),
  lineValue: z.number(),
  side: z.enum(["over", "under"]),
  edge: z.number(),
  oddsAmerican: z.number(),
});

const unwatchSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  propType: PROP_TYPE,
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to see your watchlist." }, { status: 401 });
  }
  return NextResponse.json({ watched: await getStore().listWatchedProps(user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to watch a prop." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = watchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid watch request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { gameId, playerId, propType, season, week, playerName, teamId, lineValue, side, edge, oddsAmerican } =
    parsed.data;

  await getStore().upsertWatchedProp({
    userId: user.id,
    gameId,
    playerId,
    propType,
    season,
    week,
    playerName,
    teamId,
    capturedLineValue: lineValue,
    capturedSide: side,
    capturedEdge: edge,
    capturedOddsAmerican: oddsAmerican,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to manage your watchlist." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = unwatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid unwatch request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { gameId, playerId, propType } = parsed.data;
  await getStore().removeWatchedProp(user.id, gameId, playerId, propType);

  return NextResponse.json({ ok: true });
}
