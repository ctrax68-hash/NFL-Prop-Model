/**
 * Ad-hoc diagnostics for the projection/grading path.
 *
 *   npx tsx scripts/diagnose.ts --season 2024
 */

import { withConfig } from "../src/lib/engine/config";
import { loadDataBundle, seasonsToLoad } from "../src/lib/pipeline/bundle";
import { runPipeline } from "../src/lib/pipeline/run";
import { optionalNumber, parseArgs } from "./lib/args";

async function main(): Promise<void> {
  const args = parseArgs();
  const season = optionalNumber(args, "season") ?? 2024;

  const bundle = await loadDataBundle(seasonsToLoad([season]));

  const playedSnaps = new Set(
    bundle.snapCounts
      .filter((s) => s.offenseSnaps > 0)
      .map((s) => `${s.season}|${s.week}|${normalise(s.player)}`),
  );

  let total = 0;
  let noStatRow = 0;
  let noRowButPlayed = 0;
  let zeroActual = 0;
  let overs = 0;
  let graded = 0;
  const biasByStat = new Map<
    string,
    { n: number; projected: number; actual: number }
  >();

  const config = withConfig({
    volume: { normaliseTeamShares: args.normalise !== "off" },
  });
  const staleAfterWeeks = optionalNumber(args, "stale") ?? 3;
  console.log(
    `config: normaliseTeamShares=${config.volume.normaliseTeamShares} staleAfterWeeks=${staleAfterWeeks}`,
  );

  for (const week of [3, 5, 7, 9, 11]) {
    const snapshot = await runPipeline(bundle, {
      season,
      week,
      config,
      staleAfterWeeks,
    });
    const statRows = new Set(
      bundle.playerWeeks
        .filter((r) => r.season === season && r.week === week && r.seasonType === "REG")
        .map((r) => r.playerId),
    );
    const nameById = new Map(snapshot.players.map((p) => [p.playerId, p.name]));
    const actualByProp = new Map(
      snapshot.actuals.map((a) => [a.propId, a.actualValue]),
    );
    const evaluationByProp = new Map(
      snapshot.evaluations.map((e) => [e.propId, e]),
    );

    for (const prop of snapshot.props) {
      total += 1;
      if (!statRows.has(prop.playerId)) {
        noStatRow += 1;
        const key = `${season}|${week}|${normalise(nameById.get(prop.playerId) ?? "")}`;
        if (playedSnaps.has(key)) noRowButPlayed += 1;
      }
      const actual = actualByProp.get(prop.propId);
      if (actual == null) continue;
      graded += 1;
      if (actual === 0) zeroActual += 1;
      if (actual > prop.lineValue) overs += 1;

      const evaluation = evaluationByProp.get(prop.propId);
      if (evaluation) {
        const agg = biasByStat.get(prop.propType) ?? {
          n: 0,
          projected: 0,
          actual: 0,
        };
        agg.n += 1;
        agg.projected += evaluation.projectedValue;
        agg.actual += actual;
        biasByStat.set(prop.propType, agg);
      }
    }
  }

  const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;

  console.log("");
  console.log("Projection bias on GRADED props (actual vs projected), by stat");
  for (const [stat, agg] of biasByStat) {
    if (agg.n < 40) continue;
    const meanProj = agg.projected / agg.n;
    const meanActual = agg.actual / agg.n;
    console.log(
      `  ${stat.padEnd(18)} n=${String(agg.n).padStart(4)}  ` +
        `projected ${meanProj.toFixed(2).padStart(7)}  ` +
        `actual ${meanActual.toFixed(2).padStart(7)}  ` +
        `bias ${(((meanActual - meanProj) / meanProj) * 100).toFixed(1).padStart(6)}%`,
    );
  }
  console.log("");

  console.log(`Sampled weeks 3, 5, 7, 9, 11 of ${season}`);
  console.log(`  props posted                          ${total}`);
  console.log(`  player had NO stat row that week       ${noStatRow}  (${pct(noStatRow)})`);
  console.log(`    ...but did play offensive snaps      ${noRowButPlayed}`);
  console.log(`  currently settled with actual = 0      ${zeroActual}  (${pct(zeroActual)})`);
  console.log(`  realised over rate                     ${((100 * overs) / graded).toFixed(1)}%`);
  console.log("");
  console.log(
    "  A prop on a player who never took the field should be VOID, not a loss.",
  );
  console.log(
    "  Grading those as zero manufactures unders and drags calibration down.",
  );
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
