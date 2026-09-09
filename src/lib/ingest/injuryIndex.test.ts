import { describe, expect, it } from "vitest";

import { buildInjuryIndex, injuryStatusAt } from "./injuryIndex";
import type { InjuryReportRow } from "./nflverse";

function row(overrides: Partial<InjuryReportRow> = {}): InjuryReportRow {
  return {
    season: 2026,
    week: 1,
    team: "KC",
    playerId: "p1",
    position: "WR",
    reportStatus: "questionable",
    ...overrides,
  };
}

describe("buildInjuryIndex / injuryStatusAt", () => {
  it("returns null for a player with no report", () => {
    const index = buildInjuryIndex([]);
    expect(injuryStatusAt(index, "KC", "p1", { season: 2026, week: 1 })).toBeNull();
  });

  it("looks up by season/week/team/player", () => {
    const index = buildInjuryIndex([row({ reportStatus: "out" })]);
    expect(injuryStatusAt(index, "KC", "p1", { season: 2026, week: 1 })).toBe("out");
    // Different week, different team, different player — none should match.
    expect(injuryStatusAt(index, "KC", "p1", { season: 2026, week: 2 })).toBeNull();
    expect(injuryStatusAt(index, "BUF", "p1", { season: 2026, week: 1 })).toBeNull();
    expect(injuryStatusAt(index, "KC", "p2", { season: 2026, week: 1 })).toBeNull();
  });

  it("ignores rows with no report status", () => {
    const index = buildInjuryIndex([row({ reportStatus: null })]);
    expect(injuryStatusAt(index, "KC", "p1", { season: 2026, week: 1 })).toBeNull();
  });

  it("keeps the more severe status when a player has more than one row that week", () => {
    const index = buildInjuryIndex([
      row({ reportStatus: "questionable" }),
      row({ reportStatus: "out" }),
    ]);
    expect(injuryStatusAt(index, "KC", "p1", { season: 2026, week: 1 })).toBe("out");
  });

  it("does not downgrade an already-severe status to a milder later row", () => {
    const index = buildInjuryIndex([
      row({ reportStatus: "doubtful" }),
      row({ reportStatus: "questionable" }),
    ]);
    expect(injuryStatusAt(index, "KC", "p1", { season: 2026, week: 1 })).toBe("doubtful");
  });
});
