"use client";

import { useEffect, useState } from "react";

import { formatKickoff } from "@/lib/format";

/**
 * Kickoff in the viewer's own time zone. The server has no idea where the
 * viewer is, so it renders Eastern (the league's convention, and what
 * nflverse publishes) and the client re-renders in the local zone once it
 * has mounted — the initial client render uses the same default, so there is
 * nothing for hydration to disagree about. Falls back to the date alone when
 * nflverse hasn't published a time yet, or on snapshots that predate the
 * `kickoffAt` field.
 */
export function Kickoff({
  kickoffAt,
  gameday,
  className,
}: {
  kickoffAt: string | null;
  gameday: string;
  className?: string;
}) {
  const [timeZone, setTimeZone] = useState("America/New_York");
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <time dateTime={kickoffAt ?? gameday} className={className}>
      {formatKickoff(kickoffAt, gameday, timeZone)}
    </time>
  );
}
