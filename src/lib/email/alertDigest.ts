/**
 * Pure logic for deciding which alert subscriptions moved enough to notify
 * on, and for rendering the resulting email — no fetch, no store, no env
 * access, so both halves are trivially unit-testable.
 */

import type { AlertSubscription } from "../db/store";
import type { PropType, Side } from "../engine/types";
import { PROP_LABELS, formatOdds, formatSignedPercent, teamLabel } from "../format";

/**
 * A line-value shift smaller than a full point is pricing noise on every
 * yardage/count stat this board carries — the smallest real market move
 * (`WatchingSection`'s in-app `EDGE_MOVE_THRESHOLD` is 2 percentage points
 * of edge, a different unit; there is no existing line/odds precedent to
 * copy). An email is a much higher-friction channel than an in-app pill, so
 * this is deliberately a coarser bar than a UI badge would use — worth
 * revisiting once real subscriber behavior (unsubscribes, complaints) gives
 * a signal a guess can't.
 */
export const LINE_MOVE_THRESHOLD = 1;
/** American odds move of at least this many cents on either side. */
export const ODDS_MOVE_THRESHOLD = 10;

export interface MarketSnapshot {
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
  bestSide: Side;
  bestEdge: number;
  propId: string;
}

export type SubscriptionEvaluation =
  | { action: "baseline" }
  | { action: "unpriced" }
  | { action: "unchanged" }
  | { action: "notify"; market: MarketSnapshot };

/**
 * `market` is null when this week's slate no longer prices this market at
 * all (the book pulled the line, or a provider swap dropped it) — nothing to
 * compare against, so it's left alone rather than treated as a move.
 */
export function evaluateSubscription(
  subscription: AlertSubscription,
  market: MarketSnapshot | null,
): SubscriptionEvaluation {
  if (!market) return { action: "unpriced" };

  // Never notified before: this run becomes the baseline. Subscribing to a
  // prop you're already looking at shouldn't itself trigger an email
  // restating the price you just saw.
  if (subscription.lastNotifiedAt == null) return { action: "baseline" };

  const lineMoved =
    subscription.lastNotifiedLineValue == null ||
    Math.abs(market.lineValue - subscription.lastNotifiedLineValue) >=
      LINE_MOVE_THRESHOLD;
  const oddsMoved =
    subscription.lastNotifiedOddsOver == null ||
    subscription.lastNotifiedOddsUnder == null ||
    Math.abs(market.oddsOverAmerican - subscription.lastNotifiedOddsOver) >=
      ODDS_MOVE_THRESHOLD ||
    Math.abs(market.oddsUnderAmerican - subscription.lastNotifiedOddsUnder) >=
      ODDS_MOVE_THRESHOLD;

  return lineMoved || oddsMoved ? { action: "notify", market } : { action: "unchanged" };
}

export interface DigestItem {
  playerName: string;
  teamId: string;
  propType: PropType;
  market: MarketSnapshot;
  propUrl: string;
  unsubscribeUrl: string;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

/** One user's digest of every subscription that moved this run. Callers group by user before calling this. */
export function renderAlertDigest(items: readonly DigestItem[]): DigestEmail {
  const subject =
    items.length === 1
      ? `${items[0].playerName} ${PROP_LABELS[items[0].propType]} line moved`
      : `${items.length} of your alerts moved`;

  const rowsHtml = items
    .map((item) => {
      const { market } = item;
      const oddsAmerican =
        market.bestSide === "over" ? market.oddsOverAmerican : market.oddsUnderAmerican;
      return `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #333;">
            <div style="font-weight:600;color:#111;">${escapeHtml(item.playerName)} <span style="color:#777;font-weight:400;">${teamLabel(item.teamId)}</span></div>
            <div style="color:#555;font-size:13px;margin-top:2px;">${escapeHtml(PROP_LABELS[item.propType])} &middot; ${market.bestSide === "over" ? "O" : "U"} ${market.lineValue} at ${formatOdds(oddsAmerican)} &middot; edge ${formatSignedPercent(market.bestEdge)}</div>
            <div style="margin-top:6px;">
              <a href="${item.propUrl}" style="color:#b8860b;font-size:13px;text-decoration:none;">View this prop &rarr;</a>
              &middot;
              <a href="${item.unsubscribeUrl}" style="color:#999;font-size:12px;text-decoration:underline;">Unsubscribe from this alert</a>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;background:#f6f6f6;padding:24px;">
    <table style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
      <tr><td>
        <h1 style="font-size:16px;margin:0 0 4px;color:#111;">Line movement alert</h1>
        <p style="font-size:13px;color:#777;margin:0 0 8px;">${items.length} prop${items.length === 1 ? "" : "s"} you're watching moved.</p>
      </td></tr>
      ${rowsHtml}
    </table>
  </body>
</html>`;

  const text = items
    .map((item) => {
      const { market } = item;
      const oddsAmerican =
        market.bestSide === "over" ? market.oddsOverAmerican : market.oddsUnderAmerican;
      return (
        `${item.playerName} (${teamLabel(item.teamId)}) — ${PROP_LABELS[item.propType]}: ` +
        `${market.bestSide === "over" ? "O" : "U"} ${market.lineValue} at ${formatOdds(oddsAmerican)}, ` +
        `edge ${formatSignedPercent(market.bestEdge)}\n${item.propUrl}\nUnsubscribe: ${item.unsubscribeUrl}`
      );
    })
    .join("\n\n");

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
