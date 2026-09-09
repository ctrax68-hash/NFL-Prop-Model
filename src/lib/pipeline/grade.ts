/**
 * Grade a stored slate once its games have been played.
 *
 * The weekly cron prices the *upcoming* week, so the snapshot it stores has
 * no actuals — nflverse won't have the stat lines for days. Nothing
 * re-visits that week later on its own, which is why production had never
 * graded a single prop. This attaches results to an existing snapshot,
 * leaving its projections, prices and recommendations exactly as they were
 * priced, so the grade is of what the model actually said at the time.
 */

import type { DataBundle } from "./bundle";
import { buildActuals } from "./run";
import type { SlateSnapshot } from "./types";

/** The snapshot with actuals attached, or null if the stats aren't in yet. */
export function gradeSnapshot(
  snapshot: SlateSnapshot,
  bundle: Pick<DataBundle, "playerWeeks" | "snapCounts">,
): SlateSnapshot | null {
  const actuals = buildActuals(
    bundle.playerWeeks,
    bundle.snapCounts,
    { season: snapshot.season, week: snapshot.week },
    snapshot.props,
    new Map(snapshot.players.map((player) => [player.playerId, player.name])),
  );
  if (actuals.length === 0) return null;
  return { ...snapshot, actuals };
}
