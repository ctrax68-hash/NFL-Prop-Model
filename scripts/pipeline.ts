/**
 * Run the weekly pipeline for one slate and persist the result.
 *
 *   npx tsx scripts/pipeline.ts --season 2024 --week 5
 *   npx tsx scripts/pipeline.ts --season 2024 --week 5 --provider odds-api
 *   npx tsx scripts/pipeline.ts --season 2024 --week 5 --refit-sigma
 *
 * Besides pricing the requested week this also, in order:
 *   1. grades the preceding weeks of the season whose stats have since
 *      landed (the cron only ever prices the upcoming week, so nothing else
 *      would), and
 *   2. computes the running calibration check over those graded weeks and
 *      stores it on the new snapshot, so the Backtest page can show whether
 *      this season still looks like the backtest said it would.
 *
 * `--refit-sigma` re-fits the sigma models as of the week instead of using
 * the shipped fit. It is opt-in because it measured worse: replayed over
 * 2023-2025 it raised mean calibration error from 1.22pp to 1.49pp (see the
 * note on `distribution.sigmaModels` in `src/lib/engine/config.ts`).
 */

import "./lib/env";

import { DEFAULT_CONFIG } from "../src/lib/engine/config";
import { createStore } from "../src/lib/db/factory";
import type { SlateStore } from "../src/lib/db/store";
import { buildCalibrationMonitor, driftWarnings } from "../src/lib/calibration/monitor";
import { loadBacktestReference } from "../src/lib/calibration/reference";
import { loadDataBundle, seasonsToLoad, type DataBundle } from "../src/lib/pipeline/bundle";
import { gradeSnapshot } from "../src/lib/pipeline/grade";
import { runPipeline } from "../src/lib/pipeline/run";
import type { SlateSnapshot } from "../src/lib/pipeline/types";
import { createPropsProvider } from "../src/lib/ingest/props/factory";
import { optionalNumber, parseArgs, requireNumber } from "./lib/args";

/** How many earlier weeks of the season to revisit for grading and the monitor. */
const GRADE_LOOKBACK_WEEKS = 6;

async function main(): Promise<void> {
  const args = parseArgs();
  const season = requireNumber(args, "season");
  const week = requireNumber(args, "week");
  const bankroll = optionalNumber(args, "bankroll") ?? Number(process.env.BANKROLL ?? 10000);
  const refresh = args.refresh === true;
  const refitSigma = args["refit-sigma"] === true;

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

  const store = createStore(
    typeof args.store === "string" ? args.store : undefined,
  );

  const graded = await gradeEarlierWeeks(store, bundle, season, week);

  const provider = createPropsProvider(providerName, bundle);
  console.log(`Prop lines from: ${provider.name} (real book: ${provider.isReal})`);
  console.log(`Sigma models: ${refitSigma ? "re-fitted as of this week" : "shipped (static)"}`);

  const priced = await runPipeline(bundle, {
    season,
    week,
    bankroll,
    config: DEFAULT_CONFIG,
    provider,
    refitSigma,
  });

  const reference = await loadBacktestReference();
  const monitor = buildCalibrationMonitor(graded, reference, { season, week });
  const snapshot: SlateSnapshot =
    monitor.weeks.length > 0 ? { ...priced, calibration: monitor } : priced;

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
  console.log(
    `  saved to         ${
      store.kind === "file"
        ? `.data/slates/${season}-${String(week).padStart(2, "0")}.json`
        : "Supabase (pipeline_runs + normalised tables)"
    }`,
  );

  if (snapshot.sigmaRefit) {
    console.log("");
    console.log("Sigma re-fit (applied = fit held within the band around the shipped model):");
    for (const entry of snapshot.sigmaRefit.entries) {
      const note = !entry.fitted
        ? `kept shipped (n=${entry.sampleSize} too few)`
        : entry.clamped
          ? `CLAMPED from ${entry.fitted.intercept} + ${entry.fitted.slope}·μ`
          : "";
      console.log(
        `  ${entry.stat.padEnd(16)} ${String(entry.applied.intercept).padStart(8)} + ${String(entry.applied.slope).padStart(6)}·μ` +
          `   shipped ${String(entry.shipped.intercept).padStart(8)} + ${String(entry.shipped.slope).padStart(6)}·μ` +
          `   n=${String(entry.sampleSize).padStart(4)}  ${note}`,
      );
    }
  }

  if (snapshot.calibration) {
    printMonitor(snapshot.calibration);
  } else {
    console.log("");
    console.log("Calibration check: no graded weeks yet this season.");
  }

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

/**
 * Attach results to the stored snapshots of the preceding weeks whose games
 * have been played, and return every graded snapshot in the lookback window
 * (including ones graded on earlier runs) for the monitor.
 */
async function gradeEarlierWeeks(
  store: SlateStore,
  bundle: DataBundle,
  season: number,
  week: number,
): Promise<SlateSnapshot[]> {
  const graded: SlateSnapshot[] = [];
  const notes: string[] = [];

  for (let w = week - 1; w >= Math.max(1, week - GRADE_LOOKBACK_WEEKS); w -= 1) {
    const stored = await store.loadSnapshot(season, w);
    if (!stored || stored.props.length === 0) continue;

    if (stored.actuals.length > 0) {
      graded.push(stored);
      continue;
    }

    const result = gradeSnapshot(stored, bundle);
    if (!result) {
      notes.push(`  week ${w}: stats not published yet`);
      continue;
    }
    await store.updateSnapshot(result);
    graded.push(result);
    const played = result.actuals.filter((a) => a.status === "graded").length;
    notes.push(`  week ${w}: graded ${played} of ${result.actuals.length} props (rest voided — player never took the field)`);
  }

  if (notes.length > 0) {
    console.log("Grading earlier weeks:");
    for (const note of notes) console.log(note);
  }
  return graded.sort((a, b) => a.week - b.week);
}

function printMonitor(monitor: NonNullable<SlateSnapshot["calibration"]>): void {
  const weeks = monitor.weeks.map((w) => w.week).join(", ");
  console.log("");
  console.log(
    `Calibration check — weeks ${weeks} graded: ${monitor.gradedProps} props, ${monitor.gradedBets} recommended bets` +
      (monitor.reference
        ? ` (reference: backtest ${monitor.reference.seasons[0]}-${monitor.reference.seasons[monitor.reference.seasons.length - 1]})`
        : " (no backtest reference found)"),
  );
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const line = (label: string, r: typeof monitor.overall) =>
    `  ${label.padEnd(18)} n=${String(r.n).padStart(5)}  predicted ${pct(r.predicted).padStart(6)}  realised ${pct(r.realized).padStart(6)}` +
    `  gap ${(r.biasPp >= 0 ? "+" : "") + r.biasPp.toFixed(1)}pp` +
    (r.referenceBiasPp != null ? ` (ref ${(r.referenceBiasPp >= 0 ? "+" : "") + r.referenceBiasPp.toFixed(1)}pp)` : "") +
    `  z=${r.z == null ? "  —" : r.z.toFixed(1).padStart(5)}  ${r.status.toUpperCase()}`;
  console.log(line("overall", monitor.overall));
  for (const entry of monitor.byPropType) {
    console.log(line(entry.propType, entry.calibration));
    if (entry.bets.n > 0) {
      const b = entry.bets;
      console.log(
        `    bets             n=${String(b.n).padStart(5)}  hit ${pct(b.realized).padStart(6)} vs backtest ${pct(b.predicted)}  z=${b.z == null ? "  —" : b.z.toFixed(1).padStart(5)}  ${b.status.toUpperCase()}`,
      );
    }
  }

  const warnings = driftWarnings(monitor);
  for (const warning of warnings) {
    // GitHub Actions renders `::warning::` lines as annotations on the run.
    console.log(`::warning title=Calibration drift::${warning}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
