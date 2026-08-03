/**
 * Generate slates for a range of seasons in one pass.
 *
 *   npx tsx scripts/backfill.ts --seasons 2020-2025
 *   npx tsx scripts/backfill.ts --seasons 2024 --weeks 1-18
 *
 * `scripts/pipeline.ts` does one week and reloads the whole nflverse bundle to
 * do it, which is the wrong shape for a hundred weeks. This loads the bundle
 * once per target season (each needs its own two seasons of prior history) and
 * then runs every week off that.
 *
 * Regular season only. Playoff weeks exist in the data but carry two to six
 * games and a correspondingly thin player pool, and "WK 20" is a worse label
 * than the round it actually was.
 */

import "./lib/env";

import { DEFAULT_CONFIG } from "../src/lib/engine/config";
import { createStore } from "../src/lib/db/factory";
import { loadDataBundle, seasonsToLoad } from "../src/lib/pipeline/bundle";
import { runPipeline } from "../src/lib/pipeline/run";
import { createPropsProvider } from "../src/lib/ingest/props/factory";
import { optionalNumber, parseArgs, parseSeasonRange } from "./lib/args";

/** The 17-game schedule arrived in 2021; 2020 stopped at 17 weeks. */
function regularSeasonWeeks(season: number): number[] {
  const last = season >= 2021 ? 18 : 17;
  return Array.from({ length: last }, (_, i) => i + 1);
}

function parseWeeks(value: string | undefined): number[] | null {
  if (!value) return null;
  const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid week range: ${value}`);
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  const out: number[] = [];
  for (let week = start; week <= end; week += 1) out.push(week);
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const seasons = parseSeasonRange(
    typeof args.seasons === "string" ? args.seasons : "2020-2025",
  );
  const weekOverride = parseWeeks(
    typeof args.weeks === "string" ? args.weeks : undefined,
  );
  const bankroll =
    optionalNumber(args, "bankroll") ?? Number(process.env.BANKROLL ?? 10000);
  const providerName =
    typeof args.provider === "string"
      ? args.provider
      : (process.env.PROPS_PROVIDER ?? "synthetic");

  const store = createStore(
    typeof args.store === "string" ? args.store : undefined,
  );

  const started = Date.now();
  let written = 0;
  let skipped = 0;

  for (const season of seasons) {
    // Each season's projections lean on the two before it, so the bundle is
    // reloaded per season rather than held for the whole range — it keeps peak
    // memory flat instead of growing with the number of seasons requested.
    process.stdout.write(`${season}: loading nflverse data... `);
    const bundle = await loadDataBundle(seasonsToLoad([season]));
    const provider = createPropsProvider(providerName, bundle);
    process.stdout.write(
      `${bundle.playerWeeks.length.toLocaleString()} player-weeks\n`,
    );

    for (const week of weekOverride ?? regularSeasonWeeks(season)) {
      const snapshot = await runPipeline(bundle, {
        season,
        week,
        bankroll,
        config: DEFAULT_CONFIG,
        provider,
      });

      // A week with no games is one the schedule never had; nothing to store.
      if (snapshot.games.length === 0 || snapshot.evaluations.length === 0) {
        skipped += 1;
        process.stdout.write(`  wk ${String(week).padStart(2)} — no games\n`);
        continue;
      }

      await store.saveSnapshot(snapshot);
      written += 1;
      process.stdout.write(
        `  wk ${String(week).padStart(2)} — ` +
          `${String(snapshot.games.length).padStart(2)} games, ` +
          `${String(snapshot.evaluations.length).padStart(4)} props, ` +
          `${String(snapshot.recommendations.length).padStart(3)} picks\n`,
      );
    }
  }

  console.log("");
  console.log(
    `${written} slates written` +
      (skipped ? `, ${skipped} weeks skipped` : "") +
      ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log("Next: npx tsx scripts/seed.ts");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
