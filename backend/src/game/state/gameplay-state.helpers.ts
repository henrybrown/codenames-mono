import { UnexpectedGameplayError } from "@backend/game/gameplay/errors/gameplay.errors";
import { PLAYER_ROLE, type PlayerRole } from "@codenames/shared/types";
import {
  GameAggregate,
  Round,
  HistoricalRound,
  Turn,
  Player,
  TurnPhase,
} from "./gameplay-state.types";
import type { GamePlayer } from "@backend/game/access/types";

/**
 * Pure accessor functions for retrieving derived game state.
 *
 * Flat named exports — consumers import the specific functions they
 * need rather than a property bag. No `this`-binding internally.
 */

/**
 * @returns The current round or null if it doesn't exist
 */
export const getLatestRound = (game: GameAggregate): Round | null =>
  game.currentRound || null;

/**
 * @returns The current round or throws if it doesn't exist
 */
export const getLatestRoundOrThrow = (game: GameAggregate): Round => {
  const currentRound = getLatestRound(game);
  if (!currentRound) {
    throw new UnexpectedGameplayError("No current round found");
  }
  return currentRound;
};

/**
 * @returns The number of teams in the game
 */
export const getTeamCount = (game: GameAggregate): number =>
  game.teams ? game.teams.length : 0;

/**
 * @returns Total number of rounds in the game (current + historical)
 */
export const getRoundCount = (game: GameAggregate): number => {
  const historicalCount = game.historicalRounds?.length || 0;
  const currentCount = game.currentRound ? 1 : 0;
  return historicalCount + currentCount;
};

/**
 * @param roundNumber - Round sequence number
 * @returns The requested round (current or historical) or null if not found
 */
export const findRoundByNumber = (
  game: GameAggregate,
  roundNumber: number,
): Round | HistoricalRound | null => {
  // Check current round first
  if (game.currentRound && game.currentRound.number === roundNumber) {
    return game.currentRound;
  }

  // Then check historical rounds
  if (game.historicalRounds && game.historicalRounds.length > 0) {
    return (
      game.historicalRounds.find((round) => round.number === roundNumber) ||
      null
    );
  }

  return null;
};

/**
 * @returns The winning team info of the specified round, or null if not found or not completed
 */
export const getRoundWinningTeam = (
  game: GameAggregate,
  roundNumber: number,
): { _winningTeamId: number; winningTeamName: string } | null => {
  const winner = game.historicalRounds.find(
    (round) => round.number === roundNumber,
  );

  if (!winner?._winningTeamId || !winner?.winningTeamName) {
    return null;
  }

  return {
    _winningTeamId: winner._winningTeamId,
    winningTeamName: winner.winningTeamName,
  };
};

/**
 * @returns The current active turn or null if it doesn't exist
 */
export const getCurrentTurn = (game: GameAggregate): Turn | null => {
  if (!game.currentRound?.turns) return null;

  const activeTurn = game.currentRound.turns.find(
    (turn) => turn.status === "ACTIVE",
  );
  return activeTurn || null;
};

/**
 * @returns The current turn or throws if it doesn't exist
 */
export const getCurrentTurnOrThrow = (game: GameAggregate): Turn => {
  const currentTurn = getCurrentTurn(game);
  if (!currentTurn) {
    throw new UnexpectedGameplayError("No active turn found");
  }
  return currentTurn;
};

/**
 * @returns The other team ID (assumes 2-team game)
 */
export const getOtherTeamId = (
  game: GameAggregate,
  currentTeamId: number,
): number => {
  const otherTeam = game.teams.find((team) => team._id !== currentTeamId);
  if (!otherTeam) {
    throw new UnexpectedGameplayError("No other team found");
  }
  return otherTeam._id;
};

/**
 * Pure helpers for finding the requesting user's player record in an
 * already-loaded GameAggregate.
 *
 * Used by:
 *   - Controllers (post-middleware): to resolve playerContext for the
 *     action, given an already-loaded GameAggregate.
 *   - The AI player: to resolve its own player context without HTTP.
 *
 * No async, no DB access. All inputs are values; outputs are values.
 */

const allGamePlayers = (aggregate: GameAggregate): GamePlayer[] =>
  aggregate.teams.flatMap((team) =>
    (team.players ?? []).map((p) => ({
      _id: p._id,
      publicId: p.publicId,
      _userId: p._userId,
      _teamId: p._teamId,
      publicName: p.publicName,
      teamName: p.teamName,
      role: p.role as PlayerRole,
    })),
  );

/** Find the user's player in the game, or null if not a player. */
export const findPlayerByUserId = (
  aggregate: GameAggregate,
  userId: number,
): GamePlayer | null =>
  allGamePlayers(aggregate).find((p) => p._userId === userId) ?? null;

/** Find a player by their public id, or null if not found. */
export const findPlayerByPublicId = (
  aggregate: GameAggregate,
  publicId: string,
): GamePlayer | null =>
  allGamePlayers(aggregate).find((p) => p.publicId === publicId) ?? null;

/**
 * Find the player on the active turn's team with the given role.
 *
 * Used by single-device controllers, where the role comes from the
 * request body and we need to find the corresponding player on the
 * currently-active team.
 *
 * Returns null if there's no active turn or no matching player.
 */
export const findPlayerByActiveRole = (
  aggregate: GameAggregate,
  role: PlayerRole,
): GamePlayer | null => {
  const activeTurn = aggregate.currentRound?.turns?.find(
    (t) => t.status === "ACTIVE",
  );
  if (!activeTurn) return null;
  const roundPlayers = aggregate.currentRound?.players ?? [];
  const matching = roundPlayers.find(
    (p) => p._teamId === activeTurn._teamId && p.role === role,
  );
  if (!matching) return null;
  return {
    _id: matching._id,
    publicId: matching.publicId,
    _userId: matching._userId,
    _teamId: matching._teamId,
    publicName: matching.publicName,
    teamName: matching.teamName,
    role: matching.role as PlayerRole,
  };
};

/** Convenience: is this user a member of this game? */
export const isUserPlayerInGame = (
  aggregate: GameAggregate,
  userId: number,
): boolean => findPlayerByUserId(aggregate, userId) !== null;

/**
 * Computes the active turn phase based on turn state and round players.
 * - ACTIVE turn with no clue → CODEMASTER phase (playerName set)
 * - ACTIVE turn with clue → CODEBREAKER phase (playerName null — it's a group)
 * - COMPLETED turn → null
 */
export function computeTurnPhase(
  turn: { status: string; _teamId: number; clue?: unknown },
  players: Pick<Player, "publicName" | "teamName" | "_teamId" | "role" | "isAi">[],
): TurnPhase | null {
  if (turn.status !== "ACTIVE") return null;

  const role = turn.clue ? PLAYER_ROLE.CODEBREAKER : PLAYER_ROLE.CODEMASTER;
  const teamPlayers = players.filter(
    (p) => p._teamId === turn._teamId && p.role === role,
  );
  if (teamPlayers.length === 0) return null;

  const isAi = teamPlayers.some((p) => p.isAi);

  return {
    teamName: teamPlayers[0].teamName,
    role: role as "CODEMASTER" | "CODEBREAKER",
    isAi,
    playerName: role === PLAYER_ROLE.CODEMASTER ? (teamPlayers[0].publicName ?? null) : null,
  };
}
