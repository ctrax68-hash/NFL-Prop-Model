import { describe, expect, it } from "vitest";

import { latestRunPerSlate } from "./latestRunPerSlate";

const run = (season: number, week: number, generated_at: string, run_id = `${season}-${week}-${generated_at}`) => ({
  run_id,
  season,
  week,
  generated_at,
});

describe("latestRunPerSlate", () => {
  it("keeps one row per season+week, the most recently generated", () => {
    const rows = [
      run(2026, 1, "2026-09-08T10:00:00Z", "old"),
      run(2026, 1, "2026-09-10T10:00:00Z", "newest"),
      run(2026, 1, "2026-09-09T10:00:00Z", "middle"),
    ];
    const result = latestRunPerSlate(rows);
    expect(result).toHaveLength(1);
    expect(result[0].run_id).toBe("newest");
  });

  it("does not depend on input order", () => {
    const rows = [
      run(2026, 1, "2026-09-10T10:00:00Z", "newest"),
      run(2026, 1, "2026-09-08T10:00:00Z", "old"),
    ];
    expect(latestRunPerSlate(rows)[0].run_id).toBe("newest");
    expect(latestRunPerSlate([...rows].reverse())[0].run_id).toBe("newest");
  });

  it("orders the result newest season and week first", () => {
    const rows = [
      run(2025, 18, "2026-01-05T10:00:00Z"),
      run(2026, 2, "2026-09-15T10:00:00Z"),
      run(2026, 1, "2026-09-08T10:00:00Z"),
    ];
    expect(latestRunPerSlate(rows).map((r) => `${r.season}-${r.week}`)).toEqual([
      "2026-2",
      "2026-1",
      "2025-18",
    ]);
  });

  it("returns an empty list for no runs", () => {
    expect(latestRunPerSlate([])).toEqual([]);
  });
});
