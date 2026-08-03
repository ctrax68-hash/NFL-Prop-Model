import { NextResponse } from "next/server";

import { getStore } from "@/lib/data";
import { settleBet } from "@/lib/db/store";

/**
 * Grade every pending bet whose slate has been played.
 *
 * A prop on a player who never took the field settles as "void" rather than a
 * loss, matching how a sportsbook refunds it — see `buildActuals` for why that
 * distinction matters to the model's measured calibration.
 */
export async function POST() {
  const store = getStore();
  const bets = await store.listBets();
  const pending = bets.filter((bet) => bet.status === "pending");

  if (pending.length === 0) {
    return NextResponse.json({ settled: 0, voided: 0, stillPending: 0 });
  }

  // Load each distinct slate once rather than per bet.
  const slateKeys = [...new Set(pending.map((bet) => `${bet.season}|${bet.week}`))];
  const actualsByProp = new Map<string, number | null>();
  const gradedSlates = new Set<string>();

  for (const key of slateKeys) {
    const [season, week] = key.split("|").map(Number);
    const snapshot = await store.loadSnapshot(season, week);
    if (!snapshot || snapshot.actuals.length === 0) continue;

    gradedSlates.add(key);
    for (const actual of snapshot.actuals) {
      actualsByProp.set(actual.propId, actual.actualValue);
    }
  }

  let settled = 0;
  let voided = 0;

  const updated = pending.map((bet) => {
    const slateKey = `${bet.season}|${bet.week}`;
    if (!gradedSlates.has(slateKey)) return bet;

    // Present in the slate but with a null value means the player was inactive.
    if (actualsByProp.has(bet.propId) && actualsByProp.get(bet.propId) == null) {
      voided += 1;
      return {
        ...bet,
        status: "void" as const,
        profitUnits: 0,
        settledAt: new Date().toISOString(),
      };
    }

    const actual = actualsByProp.get(bet.propId);
    if (actual == null) return bet;

    settled += 1;
    return settleBet(bet, actual);
  });

  await store.updateBets(updated);

  return NextResponse.json({
    settled,
    voided,
    stillPending: updated.filter((bet) => bet.status === "pending").length,
  });
}
