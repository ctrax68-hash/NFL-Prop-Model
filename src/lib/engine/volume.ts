/**
 * Step 3 of the spec: turn team-level pass/rush volume into per-player volume.
 */

export interface PlayerVolumeInput {
  /**
   * Team targets, not team pass attempts. Target share is measured against
   * targets, and throwaways/spikes are attempts that target nobody — using
   * attempts here would inflate every receiver on the slate by a few percent.
   */
  projectedTeamTargets: number;
  projectedTeamPassAttempts: number;
  projectedRushAttempts: number;
  baselineTargetShare: number;
  baselineRushShare: number;
  baselinePassAttemptShare: number;
}

export interface PlayerVolume {
  projectedTargets: number;
  projectedCarries: number;
  /** Pass attempts thrown by this player — non-zero only for quarterbacks. */
  projectedPlayerPassAttempts: number;
}

export function projectPlayerVolume(input: PlayerVolumeInput): PlayerVolume {
  return {
    projectedTargets: input.projectedTeamTargets * input.baselineTargetShare,
    projectedCarries: input.projectedRushAttempts * input.baselineRushShare,
    projectedPlayerPassAttempts:
      input.projectedTeamPassAttempts * input.baselinePassAttemptShare,
  };
}

/**
 * Normalise a set of shares so they sum to `targetSum`.
 *
 * Shares are estimated per player independently and shrunk toward priors, so a
 * team's target shares will not naturally sum to 1. Left alone, that means the
 * team's projected targets do not reconcile with its projected pass attempts —
 * every receiver drifts high or low together. Rescaling keeps the team-level
 * total honest, which is the whole point of building volume top-down.
 */
export function normaliseShares(
  shares: ReadonlyArray<{ playerId: string; share: number }>,
  targetSum = 1,
): Map<string, number> {
  const out = new Map<string, number>();
  const total = shares.reduce((sum, entry) => sum + Math.max(0, entry.share), 0);

  if (total <= 0) {
    for (const entry of shares) out.set(entry.playerId, 0);
    return out;
  }

  const scale = targetSum / total;
  for (const entry of shares) {
    out.set(entry.playerId, Math.max(0, entry.share) * scale);
  }
  return out;
}
