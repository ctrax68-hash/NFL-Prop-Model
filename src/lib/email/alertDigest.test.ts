import { describe, expect, it } from "vitest";

import {
  evaluateSubscription,
  renderAlertDigest,
  type MarketSnapshot,
} from "./alertDigest";
import type { AlertSubscription } from "../db/store";

function subscription(
  overrides: Partial<AlertSubscription> = {},
): AlertSubscription {
  return {
    id: "sub-1",
    userId: "user-1",
    gameId: "2025_10_BUF_KC",
    playerId: "p1",
    propType: "receiving_yards",
    season: 2025,
    week: 10,
    playerName: "Travis Kelce",
    teamId: "KC",
    lastNotifiedLineValue: null,
    lastNotifiedOddsOver: null,
    lastNotifiedOddsUnder: null,
    lastNotifiedAt: null,
    createdAt: "2025-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function market(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    lineValue: 65.5,
    oddsOverAmerican: -110,
    oddsUnderAmerican: -110,
    bestSide: "over",
    bestEdge: 0.08,
    propId: "prop-1",
    ...overrides,
  };
}

describe("evaluateSubscription", () => {
  it("is unpriced when the market no longer exists this run", () => {
    expect(evaluateSubscription(subscription(), null)).toEqual({
      action: "unpriced",
    });
  });

  it("takes the first run after subscribing as a silent baseline", () => {
    expect(evaluateSubscription(subscription(), market())).toEqual({
      action: "baseline",
    });
  });

  it("does not notify on a sub-threshold line move", () => {
    const sub = subscription({
      lastNotifiedLineValue: 65.5,
      lastNotifiedOddsOver: -110,
      lastNotifiedOddsUnder: -110,
      lastNotifiedAt: "2025-11-02T00:00:00.000Z",
    });
    const result = evaluateSubscription(sub, market({ lineValue: 65.9 }));
    expect(result).toEqual({ action: "unchanged" });
  });

  it("notifies once the line moves a full point or more", () => {
    const sub = subscription({
      lastNotifiedLineValue: 65.5,
      lastNotifiedOddsOver: -110,
      lastNotifiedOddsUnder: -110,
      lastNotifiedAt: "2025-11-02T00:00:00.000Z",
    });
    const m = market({ lineValue: 66.5 });
    expect(evaluateSubscription(sub, m)).toEqual({ action: "notify", market: m });
  });

  it("notifies on an odds move even with an unchanged line", () => {
    const sub = subscription({
      lastNotifiedLineValue: 65.5,
      lastNotifiedOddsOver: -110,
      lastNotifiedOddsUnder: -110,
      lastNotifiedAt: "2025-11-02T00:00:00.000Z",
    });
    const m = market({ oddsOverAmerican: -125 });
    expect(evaluateSubscription(sub, m)).toEqual({ action: "notify", market: m });
  });

  it("does not notify on a sub-threshold odds move", () => {
    const sub = subscription({
      lastNotifiedLineValue: 65.5,
      lastNotifiedOddsOver: -110,
      lastNotifiedOddsUnder: -110,
      lastNotifiedAt: "2025-11-02T00:00:00.000Z",
    });
    expect(evaluateSubscription(sub, market({ oddsOverAmerican: -115 }))).toEqual({
      action: "unchanged",
    });
  });
});

describe("renderAlertDigest", () => {
  it("titles a single-item digest with the player's name", () => {
    const digest = renderAlertDigest([
      {
        playerName: "Travis Kelce",
        teamId: "KC",
        propType: "receiving_yards",
        market: market(),
        propUrl: "https://example.com/prop/1",
        unsubscribeUrl: "https://example.com/unsub/1",
      },
    ]);
    expect(digest.subject).toBe("Travis Kelce Receiving Yds line moved");
    expect(digest.html).toContain("Travis Kelce");
    expect(digest.html).toContain("https://example.com/prop/1");
    expect(digest.html).toContain("https://example.com/unsub/1");
    expect(digest.text).toContain("Travis Kelce");
  });

  it("titles a multi-item digest with a count", () => {
    const item = {
      playerName: "Travis Kelce",
      teamId: "KC",
      propType: "receiving_yards" as const,
      market: market(),
      propUrl: "https://example.com/prop/1",
      unsubscribeUrl: "https://example.com/unsub/1",
    };
    const digest = renderAlertDigest([item, { ...item, playerName: "Josh Allen" }]);
    expect(digest.subject).toBe("2 of your alerts moved");
  });

  it("escapes HTML in a player name", () => {
    const digest = renderAlertDigest([
      {
        playerName: "<script>alert(1)</script>",
        teamId: "KC",
        propType: "receiving_yards",
        market: market(),
        propUrl: "https://example.com/prop/1",
        unsubscribeUrl: "https://example.com/unsub/1",
      },
    ]);
    expect(digest.html).not.toContain("<script>");
  });
});
