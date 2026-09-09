import { describe, expect, it } from "vitest";

import { formatKickoff } from "./format";

describe("formatKickoff", () => {
  const kickoff = "2026-09-13T17:00:00.000Z"; // 1:00 PM Eastern

  it("renders the kickoff in the requested zone with its abbreviation", () => {
    expect(formatKickoff(kickoff, "2026-09-13", "America/New_York")).toBe(
      "Sun, Sep 13 · 1:00 PM EDT",
    );
    expect(formatKickoff(kickoff, "2026-09-13", "America/Los_Angeles")).toBe(
      "Sun, Sep 13 · 10:00 AM PDT",
    );
  });

  it("defaults to Eastern", () => {
    expect(formatKickoff(kickoff, "2026-09-13")).toBe("Sun, Sep 13 · 1:00 PM EDT");
  });

  it("moves the calendar day when the local zone crosses midnight", () => {
    // 8:15 PM Eastern Thursday is already Friday in London. ICU spells the
    // zone "BST" or "GMT+1" depending on its data version, so accept either.
    expect(formatKickoff("2026-09-11T00:15:00.000Z", "2026-09-10", "Europe/London")).toMatch(
      /^Fri, Sep 11 · 1:15 AM (BST|GMT\+1)$/,
    );
  });

  it("falls back to the date alone without a kickoff instant, without shifting the day", () => {
    expect(formatKickoff(null, "2026-09-13", "America/Los_Angeles")).toBe("Sun, Sep 13");
    expect(formatKickoff(undefined, "2026-09-13")).toBe("Sun, Sep 13");
  });
});
