/**
 * Push slates already generated into Supabase.
 *
 * The pipeline writes to whichever backend is selected, so a fresh run with
 * `--store supabase` lands there directly. This is the backfill path for slates
 * that were generated before Supabase existed — it re-reads `.data/slates/*.json`
 * rather than recomputing them, so the numbers are identical to what the file
 * store already holds.
 *
 *   npx tsx scripts/sync-supabase.ts
 *   npx tsx scripts/sync-supabase.ts --season 2025 --week 12
 */

import { FileSlateStore } from "../src/lib/db/fileStore";
import { SupabaseSlateStore } from "../src/lib/db/supabaseStore";
import { optionalNumber, parseArgs } from "./lib/args";

async function main(): Promise<void> {
  const args = parseArgs();
  const onlySeason = optionalNumber(args, "season");
  const onlyWeek = optionalNumber(args, "week");

  const source = new FileSlateStore();
  const slates = await source.listSlates();

  const targets = slates.filter(
    (slate) =>
      (onlySeason == null || slate.season === onlySeason) &&
      (onlyWeek == null || slate.week === onlyWeek),
  );

  if (targets.length === 0) {
    console.log("No local slates to sync. Generate one first:");
    console.log("  npx tsx scripts/pipeline.ts --season 2025 --week 12");
    return;
  }

  // Constructed here rather than up front so a missing key fails with a clear
  // message before any work happens.
  const destination = new SupabaseSlateStore();

  console.log(`Syncing ${targets.length} slate(s) to Supabase...`);

  for (const summary of targets) {
    const snapshot = await source.loadSnapshot(summary.season, summary.week);
    if (!snapshot) continue;

    process.stdout.write(
      `  ${snapshot.season} week ${String(snapshot.week).padStart(2)} — ` +
        `${snapshot.props.length} props, ${snapshot.recommendations.length} bets... `,
    );

    await destination.saveSnapshot(snapshot);
    console.log("done");
  }

  const synced = await destination.listSlates();
  console.log("");
  console.log(`Supabase now holds ${synced.length} slate(s):`);
  for (const slate of synced) {
    console.log(
      `  ${slate.season} week ${String(slate.week).padStart(2)} · ` +
        `${slate.propCount} props · ${slate.recommendationCount} recommendations`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
