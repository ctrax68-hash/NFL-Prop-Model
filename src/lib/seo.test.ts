import { describe, expect, it } from "vitest";

import { gameSlug, playerIdFromSlug, playerSlug, siteUrl } from "./seo";

describe("playerSlug / playerIdFromSlug", () => {
  it("round-trips a simple name", () => {
    const slug = playerSlug("Patrick Mahomes", "00-0033873");
    expect(slug).toBe("patrick-mahomes-00-0033873");
    expect(playerIdFromSlug(slug)).toBe("00-0033873");
  });

  it("round-trips a hyphenated name", () => {
    const slug = playerSlug("Ja'Marr Chase", "00-0038112");
    expect(playerIdFromSlug(slug)).toBe("00-0038112");
  });

  it("round-trips a name with a suffix", () => {
    const slug = playerSlug("Michael Pittman Jr.", "00-0036973");
    expect(playerIdFromSlug(slug)).toBe("00-0036973");
  });

  it("returns null for a slug with no recognisable player id", () => {
    expect(playerIdFromSlug("not-a-real-slug")).toBeNull();
  });
});

describe("gameSlug", () => {
  it("is the game id verbatim", () => {
    expect(gameSlug("2025_18_NYJ_BUF")).toBe("2025_18_NYJ_BUF");
  });
});

describe("siteUrl", () => {
  it("strips a trailing slash", () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    expect(siteUrl()).toBe("https://example.com");
    process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it("falls back to localhost when unset", () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_SITE_URL = original;
  });
});
