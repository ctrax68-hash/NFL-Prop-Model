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

const subscribeSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  propType: PROP_TYPE,
  season: z.number().int(),
  week: z.number().int(),
  playerName: z.string().min(1),
  teamId: z.string().min(1),
});

const unsubscribeSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  propType: PROP_TYPE,
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to see your alerts." },
      { status: 401 },
    );
  }
  return NextResponse.json({
    subscriptions: await getStore().listAlertSubscriptions(user.id),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to set up an alert." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid alert subscription request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { gameId, playerId, propType, season, week, playerName, teamId } =
    parsed.data;

  await getStore().upsertAlertSubscription({
    userId: user.id,
    gameId,
    playerId,
    propType,
    season,
    week,
    playerName,
    teamId,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to manage your alerts." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = unsubscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid unsubscribe request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { gameId, playerId, propType } = parsed.data;
  await getStore().removeAlertSubscription(user.id, gameId, playerId, propType);

  return NextResponse.json({ ok: true });
}
