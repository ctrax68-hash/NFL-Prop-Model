/**
 * nflverse publishes `gametime` as `HH:MM` wall-clock in US/Eastern, with no
 * offset. Resolving it to a real instant has to respect the EST/EDT switch,
 * which falls mid-season (early November), so the offset is looked up per
 * date via Intl rather than hard-coded.
 */

/** `"2026-09-13"` + `"13:00"` -> `"2026-09-13T13:00:00-04:00"`, offset resolved for that date. */
export function toEasternIso(gameday: string, gametime: string): string {
  // Format the same wall-clock date/time as if it were in New York, then let
  // Intl report which UTC offset actually applied that day.
  const naiveUtc = new Date(`${gameday}T${gametime}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(naiveUtc);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const offsetMatch = /GMT([+-]\d+)/.exec(offsetPart);
  const offsetHours = offsetMatch ? Number(offsetMatch[1]) : -5;
  const sign = offsetHours <= 0 ? "-" : "+";
  const abs = Math.abs(offsetHours).toString().padStart(2, "0");
  return `${gameday}T${gametime}:00${sign}${abs}:00`;
}

/** Kickoff as a UTC ISO instant, or null when nflverse hasn't published a time yet. */
export function kickoffInstant(gameday: string, gametime: string | null): string | null {
  if (!gametime) return null;
  const parsed = new Date(toEasternIso(gameday, gametime));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
