import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getStore } from "@/lib/data";
import type { PlacedBet } from "@/lib/db/store";

const legSchema = z.object({
  propId: z.string().min(1),
  season: z.number().int(),
  week: z.number().int(),
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  teamId: z.string().min(1),
  propType: z.enum([
    "receiving_yards",
    "receptions",
    "rushing_yards",
    "rush_attempts",
    "passing_yards",
    "pass_attempts",
    "pass_completions",
  ]),
  lineValue: z.number(),
  side: z.enum(["over", "under"]),
  oddsAmerican: z.number(),
  modelProb: z.number(),
  fairProb: z.number(),
  edge: z.number(),
  units: z.number().nonnegative(),
});

const bodySchema = z.object({
  legs: z.array(legSchema).min(1),
  bankroll: z.number().positive(),
});

const UNIT_FRACTION_OF_BANKROLL = 0.01;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bet slip.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { legs, bankroll } = parsed.data;
  const placedAt = new Date().toISOString();

  const bets: PlacedBet[] = legs.map((leg) => ({
    id: randomUUID(),
    propId: leg.propId,
    season: leg.season,
    week: leg.week,
    gameId: leg.gameId,
    playerId: leg.playerId,
    playerName: leg.playerName,
    teamId: leg.teamId,
    propType: leg.propType,
    lineValue: leg.lineValue,
    side: leg.side,
    oddsAmerican: leg.oddsAmerican,
    units: leg.units,
    stake: leg.units * UNIT_FRACTION_OF_BANKROLL * bankroll,
    modelProb: leg.modelProb,
    fairProb: leg.fairProb,
    edge: leg.edge,
    placedAt,
    status: "pending",
    actualValue: null,
    profitUnits: null,
    settledAt: null,
  }));

  await getStore().placeBets(bets);

  return NextResponse.json({ placed: bets.length }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ bets: await getStore().listBets() });
}
