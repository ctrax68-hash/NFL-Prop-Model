/**
 * Send email alerts for every subscription whose market moved since the
 * last notification, for one slate.
 *
 *   npx tsx scripts/send-alerts.ts --season 2025 --week 12
 *
 * Requires the Supabase store (subscriptions live there, and a user's email
 * address only exists via Supabase Auth) and RESEND_API_KEY,
 * ALERTS_FROM_EMAIL, ALERTS_UNSUBSCRIBE_SECRET, NEXT_PUBLIC_SITE_URL all
 * set. Deliberately fails loudly (non-zero exit) rather than silently
 * no-op-ing on missing config — see `src/lib/email/resend.ts`'s doc comment
 * for why that's the opposite default from the weather/odds providers.
 */

import "./lib/env";

import { createStore } from "../src/lib/db/factory";
import { createServiceClient } from "../src/lib/db/supabaseStore";
import type { AlertSubscription } from "../src/lib/db/store";
import { buildBoardRows } from "../src/lib/board";
import { marketKey } from "../src/lib/engine/types";
import {
  evaluateSubscription,
  renderAlertDigest,
  type DigestItem,
  type MarketSnapshot,
} from "../src/lib/email/alertDigest";
import { resendConfigured, sendEmail } from "../src/lib/email/resend";
import { signUnsubscribeToken } from "../src/lib/email/unsubscribeToken";
import { requireNumber, parseArgs } from "./lib/args";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Alerts cannot run without it — refusing to silently send nothing.`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const season = requireNumber(args, "season");
  const week = requireNumber(args, "week");

  if (!resendConfigured()) {
    throw new Error(
      "RESEND_API_KEY and ALERTS_FROM_EMAIL must both be set to send alerts.",
    );
  }
  requireEnv("ALERTS_UNSUBSCRIBE_SECRET");
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");

  const store = createStore(typeof args.store === "string" ? args.store : undefined);
  if (store.kind !== "supabase") {
    throw new Error(
      `Alerts require the Supabase store (subscriber emails live in Supabase Auth); got store kind "${store.kind}". Pass --store supabase.`,
    );
  }

  const snapshot = await store.loadSnapshot(season, week);
  if (!snapshot) {
    console.log(`No slate for ${season} week ${week} — nothing to check.`);
    return;
  }

  const marketByKey = new Map<string, MarketSnapshot>();
  for (const row of buildBoardRows(snapshot)) {
    marketByKey.set(marketKey(row.gameId, row.playerId, row.propType), {
      lineValue: row.lineValue,
      oddsOverAmerican: row.oddsOverAmerican,
      oddsUnderAmerican: row.oddsUnderAmerican,
      bestSide: row.bestSide,
      bestEdge: row.bestEdge,
      propId: row.propId,
    });
  }

  const subscriptions = await store.listAllAlertSubscriptions(season, week);
  console.log(
    `${subscriptions.length} subscription(s) for ${season} week ${week}.`,
  );

  const toNotify: Array<{ subscription: AlertSubscription; market: MarketSnapshot }> = [];
  let baselined = 0;
  let unchanged = 0;
  let unpriced = 0;

  for (const subscription of subscriptions) {
    const market =
      marketByKey.get(
        marketKey(subscription.gameId, subscription.playerId, subscription.propType),
      ) ?? null;
    const evaluation = evaluateSubscription(subscription, market);

    switch (evaluation.action) {
      case "unpriced":
        unpriced += 1;
        break;
      case "unchanged":
        unchanged += 1;
        break;
      case "baseline":
        // market is non-null whenever action is "baseline" or "notify" —
        // evaluateSubscription only returns "unpriced" when market is null.
        await store.markAlertNotified(
          subscription.id,
          market!.lineValue,
          market!.oddsOverAmerican,
          market!.oddsUnderAmerican,
        );
        baselined += 1;
        break;
      case "notify":
        toNotify.push({ subscription, market: evaluation.market });
        break;
    }
  }

  console.log(
    `  ${baselined} baselined, ${unchanged} unchanged, ${unpriced} no longer priced, ${toNotify.length} moved enough to notify.`,
  );

  if (toNotify.length === 0) return;

  const byUser = new Map<string, typeof toNotify>();
  for (const entry of toNotify) {
    const list = byUser.get(entry.subscription.userId);
    if (list) list.push(entry);
    else byUser.set(entry.subscription.userId, [entry]);
  }

  const client = createServiceClient();
  let sent = 0;
  let failed = 0;

  for (const [userId, entries] of byUser) {
    try {
      const { data, error } = await client.auth.admin.getUserById(userId);
      const email = data?.user?.email;
      if (error || !email) {
        throw new Error(error?.message ?? "user has no email on file");
      }

      const items: DigestItem[] = entries.map(({ subscription, market }) => ({
        playerName: subscription.playerName,
        teamId: subscription.teamId,
        propType: subscription.propType,
        market,
        propUrl: `${siteUrl}/prop/${encodeURIComponent(market.propId)}`,
        unsubscribeUrl: `${siteUrl}/api/alerts/unsubscribe?id=${encodeURIComponent(subscription.id)}&token=${signUnsubscribeToken(subscription.id)}`,
      }));

      const digest = renderAlertDigest(items);
      const result = await sendEmail({ to: email, ...digest });
      if (!result.ok) throw new Error(result.detail);

      // Only advance the baseline once the email actually went out — a
      // failed send should be retried next run against the same diff, not
      // silently forgotten.
      for (const { subscription, market } of entries) {
        await store.markAlertNotified(
          subscription.id,
          market.lineValue,
          market.oddsOverAmerican,
          market.oddsUnderAmerican,
        );
      }
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `  Failed to alert user ${userId}:`,
        error instanceof Error ? error.message : error,
      );
      // One user's bad email/expired account should never take down alerts
      // for everyone else in the same run.
    }
  }

  console.log(`  ${sent} digest email(s) sent, ${failed} failed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
