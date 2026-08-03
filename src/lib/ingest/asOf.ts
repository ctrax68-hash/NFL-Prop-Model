/**
 * As-of filtering.
 *
 * This is the single most important piece of discipline in the whole pipeline.
 * If a backtest builds a player's baselines from games that had not been played
 * when the bet was placed, the model looks brilliant and the result is worthless.
 * Every derivation takes an `asOf` and filters through {@link before}, and the
 * backtester asserts it.
 */

export interface SeasonWeek {
  season: number;
  week: number;
}

export function compareSeasonWeek(a: SeasonWeek, b: SeasonWeek): number {
  if (a.season !== b.season) return a.season - b.season;
  return a.week - b.week;
}

/** True when `row` happened strictly before `asOf`. */
export function isBefore(row: SeasonWeek, asOf: SeasonWeek): boolean {
  return compareSeasonWeek(row, asOf) < 0;
}

/** Keep only rows that happened strictly before `asOf`. */
export function before<T extends SeasonWeek>(
  rows: readonly T[],
  asOf: SeasonWeek,
): T[] {
  return rows.filter((row) => isBefore(row, asOf));
}

/** Sort most recent first. */
export function mostRecentFirst<T extends SeasonWeek>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => compareSeasonWeek(b, a));
}

/**
 * Exponentially decaying weights by recency, most recent first.
 * A decay of 0.95 means a game from a year ago carries roughly 40% of the
 * weight of last week's.
 */
export function decayWeights(count: number, decay: number): number[] {
  const weights: number[] = [];
  for (let i = 0; i < count; i += 1) weights.push(decay ** i);
  return weights;
}

export function weightedMean(
  values: readonly number[],
  weights: readonly number[],
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    numerator += values[i] * weights[i];
    denominator += weights[i];
  }
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Empirical-Bayes shrinkage toward a prior.
 *
 * The spec suggests excluding players with too little history. Shrinking is
 * strictly better: a rookie with three good games still belongs on the board,
 * just with numbers pulled toward what a typical player at their position does,
 * rather than being trusted at face value or dropped entirely.
 *
 * @param observed The player's own estimate.
 * @param prior Positional or league-wide prior.
 * @param n Sample size behind `observed` — targets, carries or games as appropriate.
 * @param k Shrinkage constant: the sample size at which the two carry equal weight.
 */
export function shrink(
  observed: number | null,
  prior: number,
  n: number,
  k: number,
): number {
  if (observed == null || !Number.isFinite(observed)) return prior;
  if (n <= 0) return prior;
  return (n * observed + k * prior) / (n + k);
}
