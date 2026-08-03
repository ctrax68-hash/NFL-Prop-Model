"use client";

import { useState } from "react";
import clsx from "clsx";

import {
  PROP_LABELS,
  formatCurrency,
  formatOdds,
  formatSignedPercent,
  formatUnits,
  sideLabel,
} from "@/lib/format";
import { useBetSlip } from "./BetSlipProvider";

const UNIT_FRACTION_OF_BANKROLL = 0.01;

export function BetSlip() {
  const slip = useBetSlip();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  // Rendering the slip before localStorage is read would flash an empty slip
  // and mismatch the server markup.
  if (!slip.isHydrated || slip.legs.length === 0) return null;

  const stake = (units: number) =>
    units * UNIT_FRACTION_OF_BANKROLL * slip.bankroll;
  const totalStake = stake(slip.totalUnits);

  async function place() {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ legs: slip.legs, bankroll: slip.bankroll }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus("saved");
      setMessage(`${slip.legs.length} bet(s) logged to the tracker.`);
      slip.clear();
      setOpen(false);
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save bets.");
    }
  }

  return (
    <>
      {status === "saved" && message ? (
        <div
          role="status"
          className="fixed inset-x-0 top-3 z-50 mx-auto w-fit rounded-[var(--radius-pill)] bg-[var(--positive)] px-4 py-2 text-xs font-semibold text-white shadow-lg"
        >
          {message}
        </div>
      ) : null}

      {/* Collapsed bar — always reachable with a thumb on mobile. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-[var(--surface-1)]/95 backdrop-blur lg:left-auto lg:w-[380px] lg:border-l">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-ink)]">
              {slip.legs.length}
            </span>
            <span className="text-sm font-semibold">Bet Slip</span>
          </span>
          <span className="tnum text-sm text-[var(--text-secondary)]">
            {formatUnits(slip.totalUnits)} · {formatCurrency(totalStake)}
          </span>
        </button>

        {open ? (
          <div className="animate-slide-up max-h-[65vh] overflow-y-auto border-t px-4 py-3">
            <ul className="space-y-2">
              {slip.legs.map((leg) => (
                <li
                  key={`${leg.propId}|${leg.side}`}
                  className="rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {leg.playerName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {sideLabel(leg.side)} {leg.lineValue}{" "}
                        {PROP_LABELS[leg.propType]} ·{" "}
                        <span className="tnum">
                          {formatOdds(leg.oddsAmerican)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => slip.remove(leg.propId, leg.side)}
                      aria-label={`Remove ${leg.playerName} ${leg.side}`}
                      className="shrink-0 rounded-full px-2 text-lg leading-none text-[var(--text-muted)] hover:text-[var(--negative)]"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      Units
                      <input
                        type="number"
                        min={0}
                        step={0.05}
                        value={leg.units}
                        onChange={(event) =>
                          slip.setUnits(
                            leg.propId,
                            leg.side,
                            Number(event.target.value),
                          )
                        }
                        className="tnum w-20 rounded-[var(--radius-sm)] border bg-[var(--surface-1)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <div className="text-right">
                      <div className="tnum text-xs font-medium">
                        {formatCurrency(stake(leg.units))}
                      </div>
                      <div
                        className={clsx(
                          "tnum text-[11px]",
                          leg.edge >= 0
                            ? "text-[var(--positive)]"
                            : "text-[var(--text-muted)]",
                        )}
                      >
                        edge {formatSignedPercent(leg.edge)}
                      </div>
                    </div>
                  </div>

                  {leg.units !== leg.suggestedUnits ? (
                    <button
                      type="button"
                      onClick={() =>
                        slip.setUnits(leg.propId, leg.side, leg.suggestedUnits)
                      }
                      className="mt-1.5 text-[11px] text-[var(--accent)] hover:underline"
                    >
                      Reset to Kelly stake ({formatUnits(leg.suggestedUnits)})
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            <label className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
              Bankroll (1 unit = 1%)
              <input
                type="number"
                min={0}
                step={100}
                value={slip.bankroll}
                onChange={(event) => slip.setBankroll(Number(event.target.value))}
                className="tnum w-28 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
              />
            </label>

            <dl className="mt-3 space-y-1 border-t pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Total exposure</dt>
                <dd className="tnum font-medium">
                  {formatUnits(slip.totalUnits)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Total stake</dt>
                <dd className="tnum font-medium">{formatCurrency(totalStake)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">% of bankroll</dt>
                <dd className="tnum font-medium">
                  {((totalStake / Math.max(1, slip.bankroll)) * 100).toFixed(2)}%
                </dd>
              </div>
            </dl>

            {status === "error" && message ? (
              <p className="mt-2 text-[11px] text-[var(--negative)]">{message}</p>
            ) : null}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={slip.clear}
                className="rounded-[var(--radius-sm)] border px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={place}
                disabled={status === "saving"}
                className="flex-1 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {status === "saving" ? "Logging…" : "Log bets to tracker"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
