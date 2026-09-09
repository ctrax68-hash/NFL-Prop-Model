/**
 * The pipeline inserts a fresh `pipeline_runs` row every time it runs, so a
 * week that has been re-run three times has three rows. Anything listing
 * slates wants one entry per (season, week) — the newest run, matching what
 * `loadSnapshot` serves — or the picker shows "WK 1" three times.
 */
export function latestRunPerSlate<
  T extends { season: number; week: number; generated_at: string },
>(runs: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const run of runs) {
    const key = `${run.season}|${run.week}`;
    const current = latest.get(key);
    if (!current || run.generated_at > current.generated_at) latest.set(key, run);
  }
  return [...latest.values()].sort(
    (a, b) => b.season - a.season || b.week - a.week,
  );
}
