/**
 * Orchestrates steps 1-4 into a full set of projections for one game.
 * Still pure: everything it needs is passed in.
 */

import {
  adjustEfficiency,
  passingWeatherMultiplier,
  receivingDefenseZ,
  zScore,
  type LeagueDefenseNorms,
} from "./efficiency";
import { impliedTeamTotals, projectTeamPlays } from "./plays";
import { normaliseShares, projectPlayerVolume } from "./volume";
import { projectPassRushSplit } from "./gameScript";
import type { EngineConfig } from "./config";
import type {
  DefenseRates,
  GameContext,
  PlayerBaseline,
  Position,
  PropType,
  TeamRates,
} from "./types";

export interface TeamProjection {
  gameId: string;
  teamId: string;
  opponentTeamId: string;
  isHome: boolean;
  projectedPlays: number;
  passRate: number;
  projectedPassAttempts: number;
  projectedTeamTargets: number;
  projectedRushAttempts: number;
  impliedTeamTotal: number;
}

export interface PlayerGameProjection {
  playerId: string;
  gameId: string;
  teamId: string;
  opponentTeamId: string;
  position: Position;

  projectedTargets: number;
  projectedCarries: number;
  projectedReceptions: number;
  projectedReceivingYards: number;
  projectedRushingYards: number;
  projectedPassAttempts: number;
  projectedPassCompletions: number;
  projectedPassingYards: number;

  /** Intermediate values, surfaced in the UI so a projection can be read back. */
  breakdown: {
    teamPlays: number;
    teamPassAttempts: number;
    teamRushAttempts: number;
    passRate: number;
    targetShare: number;
    rushShare: number;
    yardsPerTarget: number;
    yardsPerCarry: number;
    catchRate: number;
    defenseMultiplierReceiving: number;
    weatherMultiplierPassing: number;
  };
}

export interface GameProjectionInput {
  game: GameContext;
  homeTeam: TeamRates;
  awayTeam: TeamRates;
  /** Defensive profile of the home team (faced by the away offense). */
  homeDefense: DefenseRates;
  awayDefense: DefenseRates;
  /** All players with projected usage, from both teams. */
  players: readonly PlayerBaseline[];
  norms: LeagueDefenseNorms;
}

export interface GameProjection {
  teams: TeamProjection[];
  players: PlayerGameProjection[];
}

export function projectGame(
  input: GameProjectionInput,
  config: EngineConfig,
): GameProjection {
  const { game, homeTeam, awayTeam, homeDefense, awayDefense, players, norms } =
    input;

  const absSpread = Math.abs(game.spreadHome);
  const implied = impliedTeamTotals(game.total, game.spreadHome);

  const teamProjections: TeamProjection[] = [];

  for (const side of ["home", "away"] as const) {
    const isHome = side === "home";
    const team = isHome ? homeTeam : awayTeam;
    const opponent = isHome ? awayTeam : homeTeam;
    // The home spread is stated from the home team's perspective; flip it for
    // the away team so "negative means favoured" holds for both.
    const spread = isHome ? game.spreadHome : -game.spreadHome;

    const projectedPlays = projectTeamPlays(
      {
        teamPace: team.pacePlaysPerGame,
        oppPace: opponent.pacePlaysPerGame,
        total: game.total,
        absSpread,
      },
      config,
    );

    const split = projectPassRushSplit(
      {
        projectedPlays,
        passRateOverall: team.passRateOverall,
        passRateWhenLeading: team.passRateWhenLeading,
        passRateWhenTrailing: team.passRateWhenTrailing,
        spread,
      },
      config,
    );

    teamProjections.push({
      gameId: game.gameId,
      teamId: team.teamId,
      opponentTeamId: opponent.teamId,
      isHome,
      projectedPlays,
      passRate: split.passRate,
      projectedPassAttempts: split.projectedPassAttempts,
      projectedTeamTargets:
        split.projectedPassAttempts * config.league.targetsPerPassAttempt,
      projectedRushAttempts: split.projectedRushAttempts,
      impliedTeamTotal: isHome ? implied.home : implied.away,
    });
  }

  const teamById = new Map(teamProjections.map((t) => [t.teamId, t]));
  const defenseById = new Map<string, DefenseRates>([
    [homeTeam.teamId, homeDefense],
    [awayTeam.teamId, awayDefense],
  ]);

  const weatherMultiplier = passingWeatherMultiplier(game, config);

  const targetShareByPlayer = resolveShares(
    players,
    (p) => p.baselineTargetShare,
    config,
  );
  const rushShareByPlayer = resolveShares(
    players,
    (p) => p.baselineRushShare,
    config,
  );

  const playerProjections: PlayerGameProjection[] = [];

  for (const player of players) {
    const teamProjection = teamById.get(player.teamId);
    if (!teamProjection) continue;

    const opponentDefense = defenseById.get(teamProjection.opponentTeamId);
    if (!opponentDefense) continue;

    const targetShare = targetShareByPlayer.get(player.playerId) ?? 0;
    const rushShare = rushShareByPlayer.get(player.playerId) ?? 0;

    const volume = projectPlayerVolume({
      projectedTeamTargets: teamProjection.projectedTeamTargets,
      projectedTeamPassAttempts: teamProjection.projectedPassAttempts,
      projectedRushAttempts: teamProjection.projectedRushAttempts,
      baselineTargetShare: targetShare,
      baselineRushShare: rushShare,
      baselinePassAttemptShare: player.baselinePassAttemptShare,
    });

    const recZ = receivingDefenseZ(player.position, opponentDefense, norms);
    const rushZ = zScore(
      opponentDefense.vsRbRushYardsPerCarryAllowed,
      norms.vsRbRushYardsPerCarry,
    );
    const passZ = zScore(
      opponentDefense.vsQbYardsPerAttemptAllowed,
      norms.vsQbYardsPerAttempt,
    );

    const efficiency = adjustEfficiency(
      {
        baselineYardsPerTarget: player.baselineYardsPerTarget,
        baselineYardsPerCarry: player.baselineYardsPerCarry,
        baselineCatchRate: player.baselineCatchRate,
        baselineYardsPerPassAttempt: player.baselineYardsPerPassAttempt,
        baselineCompletionRate: player.baselineCompletionRate,
        receivingDefenseZ: recZ,
        rushingDefenseZ: rushZ,
        passingDefenseZ: passZ,
        passingWeatherMultiplier: weatherMultiplier,
      },
      config,
    );

    playerProjections.push({
      playerId: player.playerId,
      gameId: game.gameId,
      teamId: player.teamId,
      opponentTeamId: teamProjection.opponentTeamId,
      position: player.position,

      projectedTargets: volume.projectedTargets,
      projectedCarries: volume.projectedCarries,
      projectedReceptions: volume.projectedTargets * efficiency.catchRate,
      projectedReceivingYards:
        volume.projectedTargets * efficiency.yardsPerTarget,
      projectedRushingYards: volume.projectedCarries * efficiency.yardsPerCarry,
      projectedPassAttempts: volume.projectedPlayerPassAttempts,
      projectedPassCompletions:
        volume.projectedPlayerPassAttempts * efficiency.completionRate,
      projectedPassingYards:
        volume.projectedPlayerPassAttempts * efficiency.yardsPerPassAttempt,

      breakdown: {
        teamPlays: teamProjection.projectedPlays,
        teamPassAttempts: teamProjection.projectedPassAttempts,
        teamRushAttempts: teamProjection.projectedRushAttempts,
        passRate: teamProjection.passRate,
        targetShare,
        rushShare,
        yardsPerTarget: efficiency.yardsPerTarget,
        yardsPerCarry: efficiency.yardsPerCarry,
        catchRate: efficiency.catchRate,
        defenseMultiplierReceiving:
          player.baselineYardsPerTarget > 0
            ? efficiency.yardsPerTarget / player.baselineYardsPerTarget
            : 1,
        weatherMultiplierPassing: weatherMultiplier,
      },
    });
  }

  return { teams: teamProjections, players: playerProjections };
}

/** Map a prop market onto the projected value that prices it. */
export function projectedValueForProp(
  projection: PlayerGameProjection,
  propType: PropType,
): number {
  switch (propType) {
    case "receiving_yards":
      return projection.projectedReceivingYards;
    case "receptions":
      return projection.projectedReceptions;
    case "rushing_yards":
      return projection.projectedRushingYards;
    case "rush_attempts":
      return projection.projectedCarries;
    case "passing_yards":
      return projection.projectedPassingYards;
    case "pass_attempts":
      return projection.projectedPassAttempts;
    case "pass_completions":
      return projection.projectedPassCompletions;
  }
}

/**
 * Normalise usage shares within each team, but only when the raw sum suggests
 * we have most of the offense. Rescaling a partial roster to sum to 1 would
 * hand the missing players' volume to whoever we happen to have.
 */
function resolveShares(
  players: readonly PlayerBaseline[],
  pick: (player: PlayerBaseline) => number,
  config: EngineConfig,
): Map<string, number> {
  const out = new Map<string, number>();
  const byTeam = new Map<string, PlayerBaseline[]>();

  for (const player of players) {
    const list = byTeam.get(player.teamId);
    if (list) list.push(player);
    else byTeam.set(player.teamId, [player]);
  }

  const [lo, hi] = config.volume.shareSumSanityBand;

  for (const roster of byTeam.values()) {
    const raw = roster.map((p) => ({ playerId: p.playerId, share: pick(p) }));
    const sum = raw.reduce((acc, entry) => acc + Math.max(0, entry.share), 0);

    const shouldNormalise =
      config.volume.normaliseTeamShares && sum >= lo && sum <= hi;

    if (shouldNormalise) {
      for (const [playerId, share] of normaliseShares(raw)) {
        out.set(playerId, share);
      }
    } else {
      for (const entry of raw) out.set(entry.playerId, Math.max(0, entry.share));
    }
  }

  return out;
}
