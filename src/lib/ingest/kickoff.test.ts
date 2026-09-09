import { describe, expect, it } from "vitest";

import { kickoffInstant, toEasternIso } from "./kickoff";

describe("kickoffInstant", () => {
  it("resolves a September kickoff as EDT (UTC-4)", () => {
    expect(kickoffInstant("2026-09-13", "13:00")).toBe("2026-09-13T17:00:00.000Z");
  });

  it("resolves a December kickoff as EST (UTC-5)", () => {
    expect(kickoffInstant("2026-12-20", "13:00")).toBe("2026-12-20T18:00:00.000Z");
  });

  it("keeps a late-night kickoff on the same Eastern date", () => {
    expect(toEasternIso("2026-09-10", "20:15")).toBe("2026-09-10T20:15:00-04:00");
    expect(kickoffInstant("2026-09-10", "20:15")).toBe("2026-09-11T00:15:00.000Z");
  });

  it("is null when no time has been published", () => {
    expect(kickoffInstant("2026-09-13", null)).toBeNull();
    expect(kickoffInstant("2026-09-13", "")).toBeNull();
  });
});
