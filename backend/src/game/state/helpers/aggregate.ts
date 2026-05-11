/**
 * Pure accessors for derived game-state.
 *
 * Operate on an already-loaded GameAggregate; no DB access, no async.
 * Used by gameplay services to read rounds/turns/teams without
 * sprinkling null checks across every call site.
 */

import { UnexpectedGameplayError } from "@backend/game/gameplay/errors/gameplay.errors";
import type {
  GameAggregate,
  Round,
  HistoricalRound,
  Turn,
} from "../types";

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
