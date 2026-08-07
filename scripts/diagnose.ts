/**
 * Ad-hoc diagnostics for the projection/grading path.
 *
 *   npx tsx scripts/diagnose.ts --season 2024
 *   npx tsx scripts/diagnose.ts --qb-share --season 2024 --week 10
 */

import {
  computeBaselines,
  computePositionPriors,
  DEFAULT_BASELINE_OPTIONS,
} from "../src/lib/ingest/baselines";
import { before } from "../src/lib/ingest/asOf";
import { withConfig } from "../src/lib/engine/config";
import { loadDataBundle, seasonsToLoad } from "../src/lib/pipeline/bundle";
import { runPipeline } from "../src/lib/pipeline/run";
import { optionalNumber, parseArgs } from "./lib/args";

/**
 * A2 hypothesis check: does pooling every QB player-week (starters and
 * mop-up backups alike) into one pass-attempt-share prior drag starters'
 * shrunk baseline below their own well-established trailing share?
 *
 * Compares each QB's raw trailing share (via computeBaselines with
 * shrinkGames=0, which collapses `shrink()` to the observed value exactly)
 * against the pooled prior and the actual shrunk baseline the pipeline uses.
 */
async function reportQbShare(season: number, week: number): Promise<void> {
  const bundle = await loadDataBundle(seasonsToLoad([season]));
  const asOf = { season, week };

  const priors = computePositionPriors(
    before(bundle.playerWeeks, asOf).filter((r) => r.seasonType === "REG"),
    (() => {
      // computeBaselines builds this internally; recomputed here only because
      // computePositionPriors needs it too and it isn't exported standalone.
      const totals = new Map<
        string,
        { targets: number; carries: number; passAttempts: number }
      >();
      for (const w of before(bundle.teamWeeks, asOf)) {
        totals.set(`${w.season}|${w.week}|${w.team}`, {
          targets: w.targets,
          carries: w.carries,
          passAttempts: w.passAttempts,
        });
      }
      return totals;
    })(),
  );
  const qbPrior = priors.get("QB")?.passAttemptShare ?? 0;

  const shrunk = computeBaselines({
    playerWeeks: bundle.playerWeeks,
    teamWeeks: bundle.teamWeeks,
    snapCounts: bundle.snapCounts,
    asOf,
  });
  const raw = computeBaselines({
    playerWeeks: bundle.playerWeeks,
    teamWeeks: bundle.teamWeeks,
    snapCounts: bundle.snapCounts,
    asOf,
    options: { ...DEFAULT_BASELINE_OPTIONS, shrinkGames: 0 },
  });

  console.log(`QB pass-attempt share as of ${season} week ${week}`);
  console.log(`  pooled prior (all QB player-weeks): ${qbPrior.toFixed(3)}`);
  console.log("");
  console.log(
    `  ${"name".padEnd(24)} ${"games".padStart(6)} ${"raw".padStart(7)} ${"prior".padStart(7)} ${"shrunk".padStart(7)}`,
  );

  const rows = [...shrunk.values()]
    .filter((r) => r.baseline.position === "QB" && r.baseline.gamesSampleN >= 6)
    .sort((a, b) => b.baseline.baselinePassAttemptShare - a.baseline.baselinePassAttemptShare);

  for (const record of rows) {
    const rawRecord = raw.get(record.baseline.playerId);
    const rawShare = rawRecord?.baseline.baselinePassAttemptShare ?? Number.NaN;
    console.log(
      `  ${record.baseline.name.padEnd(24)} ${String(record.baseline.gamesSampleN).padStart(6)} ` +
        `${rawShare.toFixed(3).padStart(7)} ${qbPrior.toFixed(3).padStart(7)} ` +
        `${record.baseline.baselinePassAttemptShare.toFixed(3).padStart(7)}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const season = optionalNumber(args, "season") ?? 2024;

  if (args["qb-share"]) {
    const week = optionalNumber(args, "week") ?? 10;
    await reportQbShare(season, week);
    return;
  }

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
