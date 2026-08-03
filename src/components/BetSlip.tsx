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
          className="fixed inset-x-0 top-3 z-50 mx-auto w-fit rounded-[var(--radius-pill)] bg-[var(--mint)] px-4 py-2 text-xs font-bold text-[#04101f] shadow-lg"
        >
          {message}
        </div>
      ) : null}

      {/* Collapsed bar — always reachable with a thumb on mobile. */}
      <div className="chrome fixed inset-x-0 bottom-0 z-40 rounded-t-[20px] border-t border-[var(--border)] lg:left-auto lg:w-[400px] lg:rounded-t-none lg:border-l">
        {/* Grab handle — the affordance people expect on a bottom sheet. */}
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--border-strong)] lg:hidden"
        />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="tap flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full text-xs font-black text-[#04101f]" style={{background:"linear-gradient(145deg, var(--gold-bright), var(--gold))", boxShadow:"var(--glow-gold-sm)"}}>
              {slip.legs.length}
            </span>
            <span className="text-sm font-bold tracking-[0.1em] text-[var(--ink)] uppercase">Bet Slip</span>
          </span>
          <span className="numeric text-sm font-semibold text-[var(--gold)]">
            {formatUnits(slip.totalUnits)} · {formatCurrency(totalStake)}
          </span>
        </button>

        {open ? (
          <div className="animate-sheet pb-safe max-h-[68vh] overflow-y-auto border-t border-[var(--border)] px-4 py-3">
            <ul className="space-y-2">
              {slip.legs.map((leg) => (
                <li
                  key={`${leg.propId}|${leg.side}`}
                  className="hairline rounded-[var(--radius-sm)] bg-[rgba(32,26,36,0.6)] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        {leg.playerName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">
                        {sideLabel(leg.side)} {leg.lineValue}{" "}
                        {PROP_LABELS[leg.propType]} ·{" "}
                        <span className="numeric">
                          {formatOdds(leg.oddsAmerican)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => slip.remove(leg.propId, leg.side)}
                      aria-label={`Remove ${leg.playerName} ${leg.side}`}
                      className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-lg leading-none text-[var(--ink-mute)] transition-colors hover:text-[var(--ember)]"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[11px] text-[var(--ink-mute)]">
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
                        // 16px is not a style choice: iOS Safari zooms the whole
                        // page in when you focus an input with a smaller font,
                        // and the user has to pinch back out every time.
                        className="numeric min-h-[40px] w-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--obsidian-1)] px-2 text-[16px] text-[var(--ink)] outline-none focus:border-[var(--gold)]"
                      />
                    </label>
                    <div className="text-right">
                      <div className="numeric text-xs font-semibold text-[var(--ink)]">
                        {formatCurrency(stake(leg.units))}
                      </div>
                      <div
                        className={clsx(
                          "numeric text-[11px] font-semibold",
                          leg.edge >= 0
                            ? "text-[var(--mint)]"
                            : "text-[var(--ink-mute)]",
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
                      className="mt-1.5 text-[11px] text-[var(--gold)] hover:underline"
                    >
                      Reset to Kelly stake ({formatUnits(leg.suggestedUnits)})
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            <label className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--ink-mute)]">
              Bankroll (1 unit = 1%)
              <input
                type="number"
                min={0}
                step={100}
                value={slip.bankroll}
                onChange={(event) => slip.setBankroll(Number(event.target.value))}
                className="numeric min-h-[40px] w-28 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(32,26,36,0.6)] px-2 text-[16px] text-[var(--ink)] outline-none focus:border-[var(--gold)]"
              />
            </label>

            <dl className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-[var(--ink-mute)]">Total exposure</dt>
                <dd className="numeric font-semibold text-[var(--ink)]">
                  {formatUnits(slip.totalUnits)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--ink-mute)]">Total stake</dt>
                <dd className="numeric font-semibold text-[var(--ink)]">{formatCurrency(totalStake)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--ink-mute)]">% of bankroll</dt>
                <dd className="numeric font-semibold text-[var(--ink)]">
                  {((totalStake / Math.max(1, slip.bankroll)) * 100).toFixed(2)}%
                </dd>
              </div>
            </dl>

            {status === "error" && message ? (
              <p className="mt-2 text-[11px] text-[var(--ember)]">{message}</p>
            ) : null}

            <div className="mt-3 flex gap-2 pb-1">
              <button
                type="button"
                onClick={slip.clear}
                className="tap rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-xs font-medium text-[var(--ink-dim)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={place}
                disabled={status === "saving"}
                className="tap flex-1 rounded-[var(--radius-sm)] px-3 text-[13px] font-black tracking-wide text-[#04101f] uppercase transition-all hover:brightness-110 disabled:opacity-60" style={{background:"linear-gradient(180deg, var(--gold-bright), var(--gold))", boxShadow:"var(--glow-gold)"}}
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
