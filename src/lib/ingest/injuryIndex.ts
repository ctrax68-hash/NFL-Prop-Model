/**
 * Injury-status lookup, keyed by the same season/week/team the reports are
 * already published against — unlike depth charts, injury reports need no
 * calendar-date interpolation: nflverse publishes one row per player per
 * week already scoped to exactly the week it applies to.
 */

import type { InjuryReportRow, InjuryReportStatus } from "./nflverse";
import type { SeasonWeek } from "./asOf";

export interface InjuryIndex {
  byKey: Map<string, InjuryReportStatus>;
}

const SEVERITY: Record<InjuryReportStatus, number> = {
  questionable: 1,
  doubtful: 2,
  out: 3,
};

export function buildInjuryIndex(rows: readonly InjuryReportRow[]): InjuryIndex {
  const byKey = new Map<string, InjuryReportStatus>();
  for (const row of rows) {
    if (row.reportStatus == null) continue;
    const key = `${row.season}|${row.week}|${row.team}|${row.playerId}`;
    const existing = byKey.get(key);
    // A player occasionally has more than one row in a week (a corrected
    // late-week update); keep the more severe designation rather than
    // whichever happened to be read last.
    if (!existing || SEVERITY[row.reportStatus] > SEVERITY[existing]) {
      byKey.set(key, row.reportStatus);
    }
  }
  return { byKey };
}

export function injuryStatusAt(
  index: InjuryIndex,
  team: string,
  playerId: string,
  asOf: SeasonWeek,
): InjuryReportStatus | null {
  return index.byKey.get(`${asOf.season}|${asOf.week}|${team}|${playerId}`) ?? null;
}
