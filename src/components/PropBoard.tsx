"use client";

import { useMemo, useState } from "react";

import type { BoardRow } from "@/lib/data";
import type { CurrentUser } from "@/lib/auth";
import type { WatchedProp } from "@/lib/db/store";
import { marketKey, type PropType } from "@/lib/engine/types";
import { PROP_LABELS } from "@/lib/format";
import { PropRow } from "./PropRow";
import { Card, Pill, SectionHeading } from "./ui";
import { WatchingSection } from "./WatchingSection";

const PROP_ORDER: PropType[] = [
  "receiving_yards",
  "receptions",
  "rushing_yards",
  "rush_attempts",
  "passing_yards",
  "pass_attempts",
  "pass_completions",
];

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

type SortKey = "edge" | "units" | "line" | "name";

export function PropBoard({
  rows,
  season,
  week,
  user,
  watchedProps,
}: {
  rows: BoardRow[];
  season: number;
  week: number;
  user: CurrentUser | null;
  watchedProps: WatchedProp[];
}) {
  const [propTypes, setPropTypes] = useState<Set<PropType>>(new Set());
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [team, setTeam] = useState<string | null>(null);
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [minEdge, setMinEdge] = useState(0);
  const [sort, setSort] = useState<SortKey>("edge");
  const [query, setQuery] = useState("");

  const [watched, setWatched] = useState<Map<string, WatchedProp>>(
    () =>
      new Map(
        watchedProps.map((w) => [marketKey(w.gameId, w.playerId, w.propType), w]),
      ),
  );

  async function toggleWatch(row: BoardRow) {
    if (!user) return;
    const key = marketKey(row.gameId, row.playerId, row.propType);

    if (watched.has(key)) {
      setWatched((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId: row.gameId,
          playerId: row.playerId,
          propType: row.propType,
        }),
      });
      return;
    }

    // Star always captures whatever the row's live values are right now, so
    // the optimistic entry needs no server round-trip to be correct.
    const oddsAmerican =
      row.bestSide === "over" ? row.oddsOverAmerican : row.oddsUnderAmerican;
    const optimistic: WatchedProp = {
      id: key,
      userId: user.id,
      gameId: row.gameId,
      playerId: row.playerId,
      propType: row.propType,
      season,
      week,
      playerName: row.playerName,
      teamId: row.teamId,
      capturedLineValue: row.lineValue,
      capturedSide: row.bestSide,
      capturedEdge: row.bestEdge,
      capturedOddsAmerican: oddsAmerican,
      createdAt: new Date().toISOString(),
    };
    setWatched((prev) => new Map(prev).set(key, optimistic));
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameId: row.gameId,
        playerId: row.playerId,
        propType: row.propType,
        season,
        week,
        playerName: row.playerName,
        teamId: row.teamId,
        lineValue: row.lineValue,
        side: row.bestSide,
        edge: row.bestEdge,
        oddsAmerican,
      }),
    });
  }

  const teams = useMemo(
    () => [...new Set(rows.map((row) => row.teamId))].sort(),
    [rows],
  );

  const availablePropTypes = useMemo(
    () => PROP_ORDER.filter((type) => rows.some((row) => row.propType === type)),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const result = rows.filter((row) => {
      if (propTypes.size > 0 && !propTypes.has(row.propType)) return false;
      if (positions.size > 0 && !positions.has(row.position)) return false;
      if (team && row.teamId !== team) return false;
      if (onlyRecommended && !row.isRecommended) return false;
      if (row.bestEdge < minEdge) return false;
      if (needle && !row.playerName.toLowerCase().includes(needle)) return false;
      return true;
    });

    return result.sort((a, b) => {
      switch (sort) {
        case "units":
          return b.recommendedUnits - a.recommendedUnits || b.bestEdge - a.bestEdge;
        case "line":
          return b.lineValue - a.lineValue;
        case "name":
          return a.playerName.localeCompare(b.playerName);
        default:
          return b.bestEdge - a.bestEdge;
      }
    });
  }, [rows, propTypes, positions, team, onlyRecommended, minEdge, sort, query]);

  const toggleSet = <T,>(
    set: Set<T>,
    value: T,
    setter: (next: Set<T>) => void,
  ) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  return (
    <div className="space-y-3">
      {watched.size > 0 ? (
        <div>
          <SectionHeading
            title="Watching"
            hint="Starred markets from this slate — flagged when the line or edge has moved since you starred it."
          />
          <WatchingSection rows={rows} watched={watched} />
        </div>
      ) : null}

      {/* Filters sit in one row above the board, horizontally scrollable on
          mobile the way a sportsbook's market chips do. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players"
            aria-label="Search players"
            // 16px keeps iOS Safari from zooming the page on focus.
            className="min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[rgba(32,26,36,0.6)] px-4 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-mute)] focus:border-[var(--gold)]"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort board"
            className="numeric min-h-[44px] shrink-0 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[rgba(32,26,36,0.6)] px-3 text-[16px] font-medium text-[var(--ink-dim)] outline-none focus:border-[var(--gold)]"
          >
            <option value="edge">Sort: Edge</option>
            <option value="units">Sort: Stake</option>
            <option value="line">Sort: Line</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        <div className="scroll-x no-scrollbar -mx-1 flex gap-1.5 px-1 pb-1">
          <Pill
            active={onlyRecommended}
            onClick={() => setOnlyRecommended((value) => !value)}
          >
            Recommended
          </Pill>
          <Pill active={minEdge > 0} onClick={() => setMinEdge(minEdge > 0 ? 0 : 0.05)}>
            Edge 5%+
          </Pill>
          <span className="mx-1 w-px shrink-0 self-stretch bg-[var(--border)]" />
          {availablePropTypes.map((type) => (
            <Pill
              key={type}
              active={propTypes.has(type)}
              onClick={() => toggleSet(propTypes, type, setPropTypes)}
            >
              {PROP_LABELS[type]}
            </Pill>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-[var(--border)]" />
          {POSITIONS.map((position) => (
            <Pill
              key={position}
              active={positions.has(position)}
              onClick={() => toggleSet(positions, position, setPositions)}
            >
              {position}
            </Pill>
          ))}
        </div>

        <div className="scroll-x no-scrollbar -mx-1 flex gap-1.5 px-1 pb-1">
          <Pill active={team === null} onClick={() => setTeam(null)}>
            All teams
          </Pill>
          {teams.map((teamId) => (
            <Pill
              key={teamId}
              active={team === teamId}
              onClick={() => setTeam(team === teamId ? null : teamId)}
            >
              {teamId}
            </Pill>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="eyebrow">
          {filtered.length} / {rows.length} markets
        </span>
        <span className="eyebrow text-[var(--mint)]">
          {filtered.filter((row) => row.isRecommended).length} model picks
        </span>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-[var(--ink-dim)]">
            No props match these filters.
          </p>
        ) : (
          filtered.map((row, index) => (
            <PropRow
              key={row.propId}
              row={row}
              season={season}
              week={week}
              index={index}
              isWatched={watched.has(marketKey(row.gameId, row.playerId, row.propType))}
              onToggleWatch={user ? () => toggleWatch(row) : undefined}
            />
          ))
        )}
      </Card>
    </div>
  );
}
