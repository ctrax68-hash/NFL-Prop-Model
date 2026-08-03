"use client";

import { useMemo, useState } from "react";

import type { BoardRow } from "@/lib/data";
import type { PropType } from "@/lib/engine/types";
import { PROP_LABELS } from "@/lib/format";
import { PropRow } from "./PropRow";
import { Card, Pill } from "./ui";

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
}: {
  rows: BoardRow[];
  season: number;
  week: number;
}) {
  const [propTypes, setPropTypes] = useState<Set<PropType>>(new Set());
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [team, setTeam] = useState<string | null>(null);
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [minEdge, setMinEdge] = useState(0);
  const [sort, setSort] = useState<SortKey>("edge");
  const [query, setQuery] = useState("");

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
            className="min-w-0 flex-1 rounded-[var(--radius-pill)] border bg-[var(--surface-2)] px-4 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort board"
            className="shrink-0 rounded-[var(--radius-pill)] border bg-[var(--surface-2)] px-3 py-2 text-xs font-medium outline-none focus:border-[var(--accent)]"
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

      <div className="flex items-center justify-between px-1 text-xs text-[var(--text-muted)]">
        <span className="tnum">
          {filtered.length} of {rows.length} props
        </span>
        <span className="tnum">
          {filtered.filter((row) => row.isRecommended).length} recommended
        </span>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
            No props match these filters.
          </p>
        ) : (
          filtered.map((row) => (
            <PropRow key={row.propId} row={row} season={season} week={week} />
          ))
        )}
      </Card>
    </div>
  );
}
