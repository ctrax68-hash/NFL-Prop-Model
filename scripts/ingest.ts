/**
 * Refresh the nflverse cache and report what the derived inputs look like.
 * Also refits the league-wide sigma models used by the distribution layer.
 *
 *   npx tsx scripts/ingest.ts --seasons 2022-2025
 *   npx tsx scripts/ingest.ts --seasons 2022-2025 --refresh
 */

import { computeBaselines } from "../src/lib/ingest/baselines";
import { computeDefenseRates } from "../src/lib/ingest/defense";
import { computeTeamRates } from "../src/lib/ingest/teamRates";
import { fitSigmaModels } from "../src/lib/ingest/varianceModel";
import { loadDataBundle } from "../src/lib/pipeline/bundle";
import { parseArgs, parseSeasonRange } from "./lib/args";

async function main(): Promise<void> {
  const args = parseArgs();
  const seasons = parseSeasonRange(
    typeof args.seasons === "string" ? args.seasons : "2022-2025",
  );
  const refresh = args.refresh === true;

  console.log(`Loading seasons ${seasons.join(", ")}${refresh ? " (forced refresh)" : ""}...`);
  const bundle = await loadDataBundle(seasons, { refresh });

  console.log("");
  console.log("Source rows");
  console.log(`  player-weeks   ${bundle.playerWeeks.length.toLocaleString()}`);
  console.log(`  team-weeks     ${bundle.teamWeeks.length.toLocaleString()}`);
  console.log(`  games          ${bundle.games.length.toLocaleString()}`);
  console.log(`  snap counts    ${bundle.snapCounts.length.toLocaleString()}`);

  const latestSeason = Math.max(...seasons);
  const asOf = { season: latestSeason + 1, week: 1 };

  const { rates: teamRates, league } = computeTeamRates(
    bundle.teamWeeks,
    bundle.margins,
    asOf,
  );
  console.log("");
  console.log("League averages");
  console.log(`  plays/game     ${league.pacePlaysPerGame.toFixed(2)}`);
  console.log(`  pass rate      ${league.passRate.toFixed(4)}`);
  console.log(`  yds/dropback   ${league.yardsPerDropback.toFixed(2)}`);
  console.log(`  yds/carry      ${league.yardsPerCarry.toFixed(2)}`);
  console.log(`  teams          ${teamRates.size}`);

  const { rates: defenseRates, norms } = computeDefenseRates(
    bundle.playerWeeks,
    asOf,
  );
  console.log("");
  console.log(`Defensive splits (${defenseRates.size} teams), league mean +/- sd`);
  for (const [label, norm] of Object.entries(norms)) {
    console.log(
      `  ${label.padEnd(24)} ${norm.mean.toFixed(3)} +/- ${norm.sd.toFixed(3)}`,
    );
  }

  const records = computeBaselines({
    playerWeeks: bundle.playerWeeks,
    teamWeeks: bundle.teamWeeks,
    snapCounts: bundle.snapCounts,
    asOf,
  });
  console.log("");
  console.log(`Player baselines: ${records.size}`);

  const fit = fitSigmaModels(bundle.playerWeeks, asOf);
  console.log("");
  console.log("Fitted sigma models  (sigma = intercept + slope * projected mean)");
  for (const [stat, model] of Object.entries(fit.models)) {
    const n = fit.sampleSizes[stat as keyof typeof fit.sampleSizes] ?? 0;
    console.log(
      `  ${stat.padEnd(18)} ${model.intercept.toFixed(4).padStart(9)} + ` +
        `${model.slope.toFixed(4).padStart(7)} * mu    (${n} player-seasons)`,
    );
  }
  console.log("");
  console.log(
    "  Paste these into DEFAULT_CONFIG.distribution.sigmaModels in src/lib/engine/config.ts",
  );
  console.log("  to make the shipped defaults match the seasons you care about.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
