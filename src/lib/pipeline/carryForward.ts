/**
 * Keep a market's props visible after a real sportsbook stops listing them.
 *
 * `runPipeline` re-fetches every prop from scratch on each run, and the
 * weekly cron re-runs the *same* week three times (Mon/Thu/Sun —
 * `.github/workflows/scrape-and-store.yml`). A real book pulls a game's
 * markets the moment it kicks off, so any run after that returns zero props
 * for it — and since a run's snapshot is stored and read back as a complete
 * replacement (`loadSnapshot` always serves only the single latest run), that
 * game's previously-priced props, evaluations, recommendations and actuals
 * simply vanished from what the app could see, even though nothing was ever
 * deleted. Confirmed against production: `(2026, 1)`'s prop count went
 * 942 → 944 → 953 → 953 → 905 → 874 across six runs as games finished during
 * the week.
 *
 * `propId` is a stable, deterministic composite key
 * (`${gameId}|${playerId}|${propType}|${bookmaker.key}` — see
 * `ingest/props/oddsApi.ts`) that doesn't change across runs for the same
 * still-open market, so "present in the previous run but missing from this
 * one" is an unambiguous test for "this specific market disappeared" —
 * whether because its whole game finished or a single line was pulled.
 *
 * `games`, `players`, `teamProjections`, `projections` and `gameLogs` are
 * deliberately left untouched: those come from nflverse's own schedule/stat
 * data (`run.ts`), not the odds provider, so they stay complete every run
 * regardless of a game finishing — merging them would be a no-op at best and
 * risks masking a real regression at worst.
 *
 * `actuals` are deliberately NOT carried forward here either, unlike every
 * other array. Carrying a prop's actual verbatim used to mean a market that
 * disappeared mid-week kept whatever grade an earlier run had computed for
 * it *before that run's own props existed* — for the large majority of a
 * week, that grade was a false "did-not-play", since a game that hasn't been
 * played yet has no stat row for anyone on it. That false grade never got
 * revisited once the real game finished, because nothing else re-touches a
 * prop's actual once it has one. The caller (`scripts/pipeline.ts`) instead
 * recomputes `actuals` fresh, from the current run's own bundle, over the
 * *full* merged props list this function returns — always current, never
 * carried.
 */

import type { SlateSnapshot } from "./types";

export interface CarryForwardResult {
  snapshot: SlateSnapshot;
  /** propIds pulled forward from the previous run — for a log line, nothing more. */
  carriedPropIds: string[];
}

export function carryForwardMissingProps(
  previous: SlateSnapshot | null,
  fresh: SlateSnapshot,
): CarryForwardResult {
  if (!previous || previous.props.length === 0) {
    return { snapshot: fresh, carriedPropIds: [] };
  }

  const freshPropIds = new Set(fresh.props.map((p) => p.propId));
  const carriedProps = previous.props.filter((p) => !freshPropIds.has(p.propId));
  if (carriedProps.length === 0) {
    return { snapshot: fresh, carriedPropIds: [] };
  }

  // By construction a carried propId is never already in `fresh` — nothing
  // to dedupe against — so every array below is a plain concatenation.
  const carriedPropIds = new Set(carriedProps.map((p) => p.propId));
  const carriedEvaluations = previous.evaluations.filter((e) =>
    carriedPropIds.has(e.propId),
  );
  const carriedRecommendations = previous.recommendations.filter((r) =>
    carriedPropIds.has(r.propId),
  );
  // RejectedCandidate carries propId but not gameId, so this has to be a
  // propId join rather than the gameId one the other arrays could use.
  const carriedRejected = previous.rejected.filter((r) => carriedPropIds.has(r.propId));

  return {
    snapshot: {
      ...fresh,
      props: [...fresh.props, ...carriedProps],
      evaluations: [...fresh.evaluations, ...carriedEvaluations],
      recommendations: [...fresh.recommendations, ...carriedRecommendations],
      rejected: [...fresh.rejected, ...carriedRejected],
    },
    carriedPropIds: [...carriedPropIds],
  };
}
