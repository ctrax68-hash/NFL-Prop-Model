/**
 * Run the weekly pipeline for one slate and persist the result.
 *
 *   npx tsx scripts/pipeline.ts --season 2024 --week 5
 *   npx tsx scripts/pipeline.ts --season 2024 --week 5 --provider odds-api
 */

import { DEFAULT_CONFIG } from "../src/lib/engine/config";
import { FileSlateStore } from "../src/lib/db/fileStore";
import { loadDataBundle, seasonsToLoad } from "../src/lib/pipeline/bundle";
import { runPipeline } from "../src/lib/pipeline/run";
import { createPropsProvider } from "../src/lib/ingest/props/factory";
import { optionalNumber, parseArgs, requireNumber } from "./lib/args";

async function main(): Promise<void> {
  const args = parseArgs();
  const season = requireNumber(args, "season");
  const week = requireNumber(args, "week");
  const bankroll = optionalNumber(args, "bankroll") ?? Number(process.env.BANKROLL ?? 10000);
  const refresh = args.refresh === true;

  const providerName =
    typeof args.provider === "string"
      ? args.provider
      : (process.env.PROPS_PROVIDER ?? "synthetic");

  console.log(`Loading nflverse data for ${season} week ${week}...`);
  const seasons = seasonsToLoad([season]);
  const bundle = await loadDataBundle(seasons, { refresh });
  console.log(
    `  ${bundle.playerWeeks.length.toLocaleString()} player-weeks across ${seasons.join(", ")}`,
  );

  const provider = createPropsProvider(providerName, bundle);
  console.log(`Prop lines from: ${provider.name} (real book: ${provider.isReal})`);

  const snapshot = await runPipeline(bundle, {
    season,
    week,
    bankroll,
    config: DEFAULT_CONFIG,
    provider,
  });

  const store = new FileSlateStore();
  await store.saveSnapshot(snapshot);

  const units = snapshot.recommendations.reduce(
    (sum, r) => sum + r.kelly.recommendedUnits,
    0,
  );

  console.log("");
  console.log(`Slate ${season} week ${week}`);
  console.log(`  games            ${snapshot.games.length}`);
  console.log(`  players          ${snapshot.players.length}`);
  console.log(`  props priced     ${snapshot.evaluations.length}`);
  console.log(`  recommendations  ${snapshot.recommendations.length}`);
  console.log(`  total exposure   ${units.toFixed(2)}u`);
  console.log(`  saved to         .data/slates/${season}-${String(week).padStart(2, "0")}.json`);

  if (!snapshot.propsAreReal) {
    console.log("");
    console.log(
      "  NOTE: lines are synthetic, derived from this model's own projections.",
    );
    console.log(
      "  Edges and ROI against them are circular and mean nothing. Calibration,",
    );
    console.log("  which is measured against real game results, does.");
  }

  const top = [...snapshot.recommendations].slice(0, 10);
  if (top.length > 0) {
    console.log("");
    console.log("Top recommendations by edge:");
    const nameById = new Map(snapshot.players.map((p) => [p.playerId, p.name]));
    for (const bet of top) {
      const name = nameById.get(bet.playerId) ?? bet.playerId;
      console.log(
        `  ${name.padEnd(24)} ${bet.propType.padEnd(16)} ${bet.side.toUpperCase().padEnd(5)} ` +
          `${String(bet.lineValue).padStart(6)} @ ${String(bet.oddsAmerican).padStart(5)}  ` +
          `edge ${(bet.edge * 100).toFixed(1).padStart(5)}%  ${bet.kelly.recommendedUnits.toFixed(2)}u`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
