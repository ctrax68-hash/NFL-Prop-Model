/**
 * Signs the one-click unsubscribe link embedded in every alert email.
 *
 * The link has to work with no session (a mail client isn't logged in), so
 * it can't go through the authenticated DELETE on `/api/alerts`. Instead the
 * link carries the subscription's own id plus an HMAC over that id, keyed by
 * a server-only secret — anyone with the link can unsubscribe that one row
 * and nothing else, and forging a link for a different id requires the
 * secret, which never leaves the server.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.ALERTS_UNSUBSCRIBE_SECRET;
  if (!value) {
    throw new Error(
      "ALERTS_UNSUBSCRIBE_SECRET is not set — cannot sign a safe unsubscribe link.",
    );
  }
  return value;
}

export function signUnsubscribeToken(subscriptionId: string): string {
  return createHmac("sha256", secret()).update(subscriptionId).digest("hex");
}

export function verifyUnsubscribeToken(
  subscriptionId: string,
  token: string,
): boolean {
  let expected: string;
  try {
    expected = signUnsubscribeToken(subscriptionId);
  } catch {
    return false;
  }

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  // Constant-time comparison — the whole point of an HMAC is defeated by a
  // string-equality check that returns early on the first mismatched byte.
  return a.length === b.length && timingSafeEqual(a, b);
}
