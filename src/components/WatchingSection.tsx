"use client";

import Link from "next/link";

import type { BoardRow } from "@/lib/data";
import type { WatchedProp } from "@/lib/db/store";
import { marketKey } from "@/lib/engine/types";
import { PROP_SHORT, formatPercent } from "@/lib/format";
import { Card } from "./ui";

/** A shift smaller than this reads as pricing noise, not a real move. */
const EDGE_MOVE_THRESHOLD = 0.02;

/**
 * Purely a page-load comparison — no background job, no push. If the tab
 * isn't reopened, nothing happens; that's an accepted tradeoff, not a bug.
 */
export function WatchingSection({
  rows,
  watched,
}: {
  rows: BoardRow[];
  watched: Map<string, WatchedProp>;
}) {
  const rowsByKey = new Map(
    rows.map((row) => [marketKey(row.gameId, row.playerId, row.propType), row]),
  );

  const entries = [...watched.values()]
    .map((w) => ({
      watched: w,
      row: rowsByKey.get(marketKey(w.gameId, w.playerId, w.propType)),
    }))
    .filter(
      (entry): entry is { watched: WatchedProp; row: BoardRow } =>
        entry.row != null,
    );

  if (entries.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      {entries.map(({ watched: w, row }) => {
        const lineMoved = w.capturedLineValue !== row.lineValue;
        const edgeMoved = Math.abs(w.capturedEdge - row.bestEdge) >= EDGE_MOVE_THRESHOLD;
        const moved = lineMoved || edgeMoved;

        return (
          <Link
            key={w.id}
            href={`/prop/${encodeURIComponent(row.propId)}`}
            className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[rgba(255,194,75,0.035)]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">
                {row.playerName}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">
                {PROP_SHORT[row.propType]} ·{" "}
                {lineMoved ? (
                  <span className="numeric font-semibold text-[var(--gold)]">
                    {w.capturedLineValue} &rarr; {row.lineValue}
                  </span>
                ) : (
                  <span className="numeric">{row.lineValue}</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {moved ? (
                <span className="rounded-[var(--radius-pill)] bg-[rgba(255,194,75,0.15)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--gold)]">
                  Moved
                </span>
              ) : null}
              <span className="numeric text-[11px] text-[var(--ink-mute)]">
                edge {formatPercent(row.bestEdge)}
              </span>
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
