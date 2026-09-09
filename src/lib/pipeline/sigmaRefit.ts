/**
 * Apply a fresh sigma fit to a config for one pipeline run.
 *
 * The shipped `distribution.sigmaModels` were fitted once (2020-2022) and
 * validated out of sample. Re-fitting them every week from everything played
 * before the week being projected lets sigma track the league as it drifts,
 * but a single fit is still a statistical estimate — so each parameter is
 * held within a band around the shipped value rather than trusted outright,
 * and a stat whose fit lacked sample keeps the shipped model. What was
 * applied, and whether the band bit, is recorded on the snapshot so a run
 * can always say which numbers priced it.
 */

import type { EngineConfig, SigmaModel } from "../engine/config";
import type { StatType } from "../engine/types";
import type { SeasonWeek } from "../ingest/asOf";
import type { SigmaFitResult } from "../ingest/varianceModel";

/** Same floor `fitSigmaModels` uses before it trusts a fit. */
export const SIGMA_REFIT_MIN_SAMPLE = 30;
/** Fitted intercept/slope may move at most this multiple from the shipped value. */
export const SIGMA_REFIT_MAX_RATIO = 1.5;

export interface SigmaRefitEntry {
  stat: StatType;
  sampleSize: number;
  shipped: SigmaModel;
  /** Null when the fit lacked sample and the shipped model was kept. */
  fitted: SigmaModel | null;
  applied: SigmaModel;
  clamped: boolean;
}

export interface SigmaRefitReport {
  asOf: SeasonWeek;
  maxRatio: number;
  entries: SigmaRefitEntry[];
}

function bounded(fitted: number, shipped: number, maxRatio: number): number {
  if (shipped <= 0) return fitted;
  return Math.min(shipped * maxRatio, Math.max(shipped / maxRatio, fitted));
}

export function withRefitSigma(
  config: EngineConfig,
  fit: SigmaFitResult,
  asOf: SeasonWeek,
  maxRatio: number = SIGMA_REFIT_MAX_RATIO,
): { config: EngineConfig; report: SigmaRefitReport } {
  const shippedModels = config.distribution.sigmaModels;
  const applied = { ...shippedModels };
  const entries: SigmaRefitEntry[] = [];

  for (const stat of Object.keys(shippedModels) as StatType[]) {
    const shipped = shippedModels[stat];
    const sampleSize = fit.sampleSizes[stat] ?? 0;
    const fitted = sampleSize >= SIGMA_REFIT_MIN_SAMPLE ? fit.models[stat] : null;

    if (!fitted) {
      entries.push({ stat, sampleSize, shipped, fitted: null, applied: shipped, clamped: false });
      continue;
    }

    const model: SigmaModel = {
      intercept: round(bounded(fitted.intercept, shipped.intercept, maxRatio)),
      slope: round(bounded(fitted.slope, shipped.slope, maxRatio)),
      min: shipped.min,
    };
    applied[stat] = model;
    entries.push({
      stat,
      sampleSize,
      shipped,
      fitted,
      applied: model,
      clamped: model.intercept !== round(fitted.intercept) || model.slope !== round(fitted.slope),
    });
  }

  return {
    config: {
      ...config,
      configVersion: `${config.configVersion}+sigma-refit`,
      distribution: { ...config.distribution, sigmaModels: applied },
    },
    report: { asOf, maxRatio, entries },
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
