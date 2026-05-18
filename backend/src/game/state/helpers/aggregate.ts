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

/** Returns the current round, or `null` between rounds. */
export const getLatestRound = (game: GameAggregate): Round | null =>
  game.currentRound || null;

/**
 * Same as `getLatestRound` but throws `UnexpectedGameplayError` when there
 * isn't one.
 *
 * Use when the caller has already validated that a round must exist.
 */
export const getLatestRoundOrThrow = (game: GameAggregate): Round => {
  const currentRound = getLatestRound(game);
  if (!currentRound) {
    throw new UnexpectedGameplayError("No current round found");
  }
  return currentRound;
};

/** Number of teams in the game (0 when teams haven't been seeded yet). */
export const getTeamCount = (game: GameAggregate): number =>
  game.teams ? game.teams.length : 0;

/** Number of rounds the game has had, including the current one. */
export const getRoundCount = (game: GameAggregate): number => {
  const historicalCount = game.historicalRounds?.length || 0;
  const currentCount = game.currentRound ? 1 : 0;
  return historicalCount + currentCount;
};

/**
 * Returns the round with the given sequence number, looking in the current
 * round first then in historical rounds. Returns `null` if no match.
 */
export const findRoundByNumber = (
  game: GameAggregate,
  roundNumber: number,
): Round | HistoricalRound | null => {
  if (game.currentRound && game.currentRound.number === roundNumber) {
    return game.currentRound;
  }

  if (game.historicalRounds && game.historicalRounds.length > 0) {
    return (
      game.historicalRounds.find((round) => round.number === roundNumber) ||
      null
    );
  }

  return null;
};

/**
 * Returns the winning team for a completed historical round, or `null` if
 * the round isn't found or has no winner recorded.
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

/** Returns the active turn in the current round, or `null` if none. */
export const getCurrentTurn = (game: GameAggregate): Turn | null => {
  if (!game.currentRound?.turns) return null;

  const activeTurn = game.currentRound.turns.find(
    (turn) => turn.status === "ACTIVE",
  );
  return activeTurn || null;
};

/**
 * Same as `getCurrentTurn` but throws `UnexpectedGameplayError` when there
 * isn't one.
 *
 * Use when the caller has already validated that an active turn must exist.
 */
export const getCurrentTurnOrThrow = (game: GameAggregate): Turn => {
  const currentTurn = getCurrentTurn(game);
  if (!currentTurn) {
    throw new UnexpectedGameplayError("No active turn found");
  }
  return currentTurn;
};

/**
 * Returns the id of the team that isn't `currentTeamId`.
 *
 * Assumes a two-team game; throws `UnexpectedGameplayError` if no opposing
 * team is found.
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
