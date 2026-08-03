"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { SlateSummary } from "@/lib/pipeline/types";

/**
 * Season and week pickers for the board.
 *
 * Two things this fixes over the single combined `<select>` it replaces.
 *
 * It reads the current slate from the URL rather than being handed one. `Nav`
 * renders in the root layout, which never sees a page's `searchParams`, so the
 * old picker was given `slates[0]` — the newest slate — and showed that no
 * matter which week you were actually looking at. Selecting 2020 week 10 left
 * the control reading "2025 · WK 18".
 *
 * And it splits the choice in two. One list of 107 weeks is a scroll wheel you
 * cannot find anything in; six seasons and eighteen weeks are both glanceable.
 */
export function SlatePicker({ slates }: { slates: SlateSummary[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const weeksBySeason = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const slate of slates) {
      const weeks = map.get(slate.season);
      if (weeks) weeks.push(slate.week);
      else map.set(slate.season, [slate.week]);
    }
    for (const weeks of map.values()) weeks.sort((a, b) => b - a);
    return map;
  }, [slates]);

  const seasons = useMemo(
    () => [...weeksBySeason.keys()].sort((a, b) => b - a),
    [weeksBySeason],
  );

  if (slates.length === 0 || seasons.length === 0) return null;

  // The URL is the source of truth; the newest slate is only the fallback for
  // a bare "/" with no query.
  const urlSeason = Number(params.get("season"));
  const urlWeek = Number(params.get("week"));
  const season = weeksBySeason.has(urlSeason) ? urlSeason : slates[0].season;
  const weeks = weeksBySeason.get(season) ?? [];
  const week = weeks.includes(urlWeek) ? urlWeek : (weeks[0] ?? slates[0].week);

  const go = (nextSeason: number, nextWeek: number) => {
    router.push(`/?season=${nextSeason}&week=${nextWeek}`);
  };

  const onSeason = (value: number) => {
    const available = weeksBySeason.get(value) ?? [];
    // Hold the week across a season change where that week exists — 2020 is a
    // 17-week season, so week 18 has to fall back rather than 404.
    go(value, available.includes(week) ? week : (available[0] ?? 1));
  };

  const selectClass =
    "numeric min-h-[44px] shrink-0 rounded-[var(--radius-pill)] border " +
    "border-[var(--border)] bg-[var(--obsidian-3)] pl-2.5 pr-1 text-[16px] " +
    "font-medium text-[var(--ink-dim)] outline-none focus:border-[var(--gold)]";

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <label className="sr-only" htmlFor="season-picker">
        Season
      </label>
      <select
        id="season-picker"
        value={season}
        onChange={(event) => onSeason(Number(event.target.value))}
        className={selectClass}
      >
        {seasons.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="week-picker">
        Week
      </label>
      <select
        id="week-picker"
        value={week}
        onChange={(event) => go(season, Number(event.target.value))}
        className={selectClass}
      >
        {weeks.map((value) => (
          <option key={value} value={value}>
            WK {value}
          </option>
        ))}
      </select>
    </div>
  );
}
