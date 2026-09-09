/**
 * A synthetic sportsbook.
 *
 * Generates plausible prop lines so the full pipeline — projection, pricing,
 * selection, sizing, grading, backtest — runs end to end with no API key and no
 * network access.
 *
 * READ THIS BEFORE TRUSTING ANY ROI NUMBER PRODUCED AGAINST IT.
 *
 * The synthetic book sets its line by taking the model's own projection and
 * perturbing it with noise. That means measured "edge" is just the noise term
 * read back, and ROI against these lines is circular — it says nothing about
 * whether the model would beat a real sportsbook. What these lines DO validate,
 * and validate properly, is everything mechanical: that probabilities are
 * computed correctly, that grading and settlement work, that Kelly sizing
 * behaves, and above all that the model is CALIBRATED — that props priced at
 * 60% actually land about 60% of the time. Calibration is measured against real
 * game outcomes, so it is not circular at all.
 */

import type { PropLine, PropType } from "../../engine/types";
import type { EngineConfig } from "../../engine/config";
import { impliedProbToAmerican } from "../../engine/odds";
import { computeOverUnder, estimateSigma } from "../../engine/distribution";
import { clamp } from "../../engine/math";
import { projectedValueForProp } from "../../engine/project";
import {
  MARKETS_BY_POSITION,
  hashString,
  mulberry32,
  standardNormal,
  type PropsProvider,
  type PropsProviderContext,
} from "./provider";

export interface SyntheticOptions {
  /**
   * How far the book's opinion drifts from ours, as a fraction of the stat's
   * standard deviation. This is the term that creates apparent edge.
   */
  bookDisagreementSigmaFraction: number;
  /** Total overround the synthetic book charges on a two-way market. */
  overround: number;
  /** Random variation in how the vig is split between the two sides. */
  vigSkew: number;
  /** Seed, so a given week always produces the same board. */
  seed: number;
  bookName: string;
}

export const DEFAULT_SYNTHETIC_OPTIONS: SyntheticOptions = {
  bookDisagreementSigmaFraction: 0.12,
  overround: 1.045,
  vigSkew: 0.012,
  seed: 20260803,
  bookName: "synthetic",
};

/**
 * Nearest line of the form k + 0.5.
 *
 * Books post half-point lines so props cannot push. The rounding has to be
 * unbiased: `Math.round(v) + 0.5` looks reasonable but shifts every line about
 * half a unit above the estimate, which on a 2.6-reception projection means a
 * 3.5 line and a fake 30% edge on the under. Rounding to the *nearest* half
 * point keeps the line within 0.5 of the book's estimate in both directions.
 */
function nearestHalfPoint(value: number): number {
  return Math.round(value - 0.5) + 0.5;
}

function roundLine(propType: PropType, value: number): number {
  switch (propType) {
    case "receiving_yards":
    case "rushing_yards":
      return nearestHalfPoint(value);
    case "passing_yards":
      // Passing yardage is posted in steps of 5, on the half point.
      return Math.round((value - 0.5) / 5) * 5 + 0.5;
    case "receptions":
    case "rush_attempts":
    case "pass_attempts":
    case "pass_completions":
      return nearestHalfPoint(value);
  }
}

/** Step between adjacent postable lines for a market. */
function lineStep(propType: PropType): number {
  return propType === "passing_yards" ? 5 : 1;
}

/**
 * Pick the line a book would actually post: the one closest to a coin flip
 * under the book's own view of the player.
 *
 * Posting the line at the projected MEAN is wrong, and wrong in a direction
 * that matters. Receptions and yardage are right-skewed, so their median sits
 * below their mean — a line at the mean is genuinely less than 50% to go over,
 * and pricing it -110/-110 hands out a large phantom edge on every under. Books
 * set lines to balance action, which means near the median. Searching for the
 * postable line whose over probability is nearest 50% reproduces that, and
 * leaves the model's disagreement as the only source of edge.
 */
function chooseLine(
  propType: PropType,
  bookMean: number,
  sigma: number,
  config: EngineConfig,
  snapShare: number | null,
): { lineValue: number; bookProbOver: number } {
  const step = lineStep(propType);
  const centre = roundLine(propType, bookMean);

  let best = { lineValue: centre, bookProbOver: 0.5, distance: Number.POSITIVE_INFINITY };

  // Two sigma either side of the estimate always contains the median.
  const reach = Math.max(1, Math.ceil((2 * sigma) / step));

  for (let i = -reach; i <= reach; i += 1) {
    const lineValue = centre + i * step;
    if (lineValue < 0.5) continue;

    // Must match the same hurdle-adjusted distribution the real evaluation
    // prices against — otherwise the synthetic book posts a line for the
    // median of a distribution the model no longer actually believes, which
    // reintroduces a bias by construction rather than measuring one.
    const { probOver } = computeOverUnder(
      { stat: propType, mean: bookMean, sigma, line: lineValue, snapShare },
      config,
    );

    const distance = Math.abs(probOver - 0.5);
    if (distance < best.distance) {
      best = { lineValue, bookProbOver: probOver, distance };
    }
  }

  return { lineValue: best.lineValue, bookProbOver: best.bookProbOver };
}

export class SyntheticPropsProvider implements PropsProvider {
  readonly name: string;
  readonly isReal = false;

  private readonly options: SyntheticOptions;

  constructor(options: Partial<SyntheticOptions> = {}) {
    this.options = { ...DEFAULT_SYNTHETIC_OPTIONS, ...options };
    this.name = this.options.bookName;
  }

  async fetchProps(context: PropsProviderContext): Promise<PropLine[]> {
    const { config } = context;
    const timestamp = new Date().toISOString();
    const props: PropLine[] = [];

    for (const projection of context.projections) {
      const baseline = context.baselines.get(projection.playerId);
      if (!baseline) continue;

      const markets = MARKETS_BY_POSITION[projection.position];
      if (!markets) continue;

      for (const market of markets) {
        const projectedValue = projectedValueForProp(projection, market.propType);
        if (!Number.isFinite(projectedValue) || projectedValue < market.minProjection) {
          continue;
        }

        const propId = `${projection.gameId}|${projection.playerId}|${market.propType}`;
        const random = mulberry32(
          hashString(propId) ^ (this.options.seed >>> 0),
        );

        const sigma = estimateSigma(
          {
            stat: market.propType,
            projectedMean: projectedValue,
            playerGames: baseline.gamesSampleN,
          },
          config,
        );

        // The book's own estimate: our projection plus a disagreement term.
        const bookEstimate =
          projectedValue +
          standardNormal(random) *
            sigma *
            this.options.bookDisagreementSigmaFraction;

        const { lineValue, bookProbOver } = chooseLine(
          market.propType,
          Math.max(0, bookEstimate),
          sigma,
          config,
          baseline.baselineSnapShare ?? null,
        );

        // The book prices the line it posted according to its own view, then
        // adds vig, split slightly unevenly between the sides as a real book
        // would.
        const skew = (random() - 0.5) * 2 * this.options.vigSkew;
        const fairOver = clamp(bookProbOver + skew, 0.2, 0.8);
        const overRaw = clamp(fairOver * this.options.overround, 0.02, 0.98);
        const underRaw = clamp(
          (1 - fairOver) * this.options.overround,
          0.02,
          0.98,
        );

        props.push({
          propId,
          gameId: projection.gameId,
          playerId: projection.playerId,
          propType: market.propType,
          lineValue,
          oddsOverAmerican: Math.round(impliedProbToAmerican(overRaw)),
          oddsUnderAmerican: Math.round(impliedProbToAmerican(underRaw)),
          bookName: this.name,
          timestamp,
        });
      }
    }

    return props;
  }
}
