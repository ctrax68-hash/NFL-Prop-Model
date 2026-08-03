/**
 * Print the current NFL season/week, for the scheduled scrape job to consume.
 *
 *   npx tsx scripts/current-week.ts
 *   season=2025
 *   week=12
 *
 * Three distinct exit codes, because "nothing to do" and "something broke"
 * need to be told apart by the workflow that calls this:
 *   0 — found a week; the two lines above are on stdout.
 *   3 — no current week (off-season, or the schedule is published but still
 *       months out). Deliberate, not an error.
 *   1 — a real failure (e.g. the schedule fetch itself failed).
 */

import "./lib/env";

import { loadGames } from "../src/lib/ingest/nflverse";
import { resolveCurrentWeek } from "../src/lib/schedule";

const NO_CURRENT_WEEK_EXIT_CODE = 3;

async function main(): Promise<void> {
  const games = await loadGames();
  const current = resolveCurrentWeek(games);

  if (!current) {
    console.error("No current NFL week right now (off-season or between seasons).");
    process.exit(NO_CURRENT_WEEK_EXIT_CODE);
  }

  console.log(`season=${current.season}`);
  console.log(`week=${current.week}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
