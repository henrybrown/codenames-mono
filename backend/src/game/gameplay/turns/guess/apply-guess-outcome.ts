/**
 * Post-guess cascade orchestrator.
 *
 * Given the outcome of a just-completed guess, drives any cascading
 * turn-end / round-end / game-end via the supplied ops. Returns a
 * description of what fired (used by the service to decide which
 * websocket events to emit after the transaction commits).
 *
 * This is game logic, not transport. WebSocket emits stay in the
 * service layer based on the returned aftermath.
 *
 * Lives in guess/ because it's the post-guess flow. Imports from
 * rounds/ (winning-conditions, end-round side-effects) reflect the
 * cascade's reach into round-lifecycle.
 */
import { CODEBREAKER_OUTCOME } from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import { checkRoundWinner, checkGameWinner } from "../../rounds";
import { getOtherTeamId } from "@backend/game/state/helpers";

/* -------------------------------------------------------------------------- */
/* applyGuessOutcome — the post-guess orchestrator                            */
/* -------------------------------------------------------------------------- */

/**
 * Describes what happened during/after a guess. Returned from
 * applyGuessOutcome so the caller (service) knows which events to emit.
 */
export type GuessAftermath = {
  turnEnded: boolean;
  roundEnded: { winningTeamId: number } | null;
  gameEnded: { winningTeamId: number } | null;
};

/**
 * The ops slice applyGuessOutcome needs.
 *
 * We pass a narrow interface instead of the full GameplayOperations so the
 * function is unit-testable with a hand-rolled fake and isn't tied to a
 * specific handler implementation.
 */
export type GuessOutcomeOps = {
  endTurn: (turnId: number) => Promise<GameAggregate>;
  endRound: (roundId: number, winningTeamId: number) => Promise<GameAggregate>;
  endGame: (winningTeamId: number) => Promise<GameAggregate>;
};

/**
 * Inputs from the just-completed guess.
 */
export type GuessOutcomeInput = {
  outcome: string; // CODEBREAKER_OUTCOME value
  turnId: number;
  guessingTeamId: number;
  guessesRemaining: number;
  /** State as of right after the guess was recorded. */
  postGuessState: GameAggregate;
};

/**
 * Given a guess outcome and the resulting state, drive any cascading
 * turn-end / round-end / game-end via the supplied ops. Returns a
 * description of what fired.
 *
 * This is game logic, not transport. WebSocket emits stay in the
 * service layer based on the returned aftermath.
 */
export const applyGuessOutcome = async (
  ops: GuessOutcomeOps,
  input: GuessOutcomeInput,
): Promise<GuessAftermath> => {
  const { outcome, turnId, guessingTeamId, guessesRemaining, postGuessState } =
    input;

  const aftermath: GuessAftermath = {
    turnEnded: false,
    roundEnded: null,
    gameEnded: null,
  };

  switch (outcome) {
    case CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD: {
      const otherTeamId = getOtherTeamId(postGuessState, guessingTeamId);
      const winner = checkRoundWinner(
        postGuessState.currentRound!.cards,
        guessingTeamId,
        otherTeamId,
      );
      if (winner !== null) {
        const afterTurn = await ops.endTurn(turnId);
        aftermath.turnEnded = true;
        const afterRound = await ops.endRound(
          afterTurn.currentRound!._id,
          winner,
        );
        aftermath.roundEnded = { winningTeamId: winner };
        const gameWinner = checkGameWinner(
          afterRound.historicalRounds,
          afterRound.game_format,
        );
        if (gameWinner !== null) {
          await ops.endGame(gameWinner);
          aftermath.gameEnded = { winningTeamId: gameWinner };
        }
      } else if (guessesRemaining === 0) {
        await ops.endTurn(turnId);
        aftermath.turnEnded = true;
      }
      break;
    }
    case CODEBREAKER_OUTCOME.OTHER_TEAM_CARD: {
      const afterTurn = await ops.endTurn(turnId);
      aftermath.turnEnded = true;
      const otherTeamId = getOtherTeamId(afterTurn, guessingTeamId);
      const winner = checkRoundWinner(
        afterTurn.currentRound!.cards,
        guessingTeamId,
        otherTeamId,
      );
      if (winner !== null) {
        const afterRound = await ops.endRound(
          afterTurn.currentRound!._id,
          winner,
        );
        aftermath.roundEnded = { winningTeamId: winner };
        const gameWinner = checkGameWinner(
          afterRound.historicalRounds,
          afterRound.game_format,
        );
        if (gameWinner !== null) {
          await ops.endGame(gameWinner);
          aftermath.gameEnded = { winningTeamId: gameWinner };
        }
      }
      break;
    }
    case CODEBREAKER_OUTCOME.BYSTANDER_CARD: {
      await ops.endTurn(turnId);
      aftermath.turnEnded = true;
      break;
    }
    case CODEBREAKER_OUTCOME.ASSASSIN_CARD: {
      const afterTurn = await ops.endTurn(turnId);
      aftermath.turnEnded = true;
      const otherTeamId = getOtherTeamId(afterTurn, guessingTeamId);
      const afterRound = await ops.endRound(
        afterTurn.currentRound!._id,
        otherTeamId,
      );
      aftermath.roundEnded = { winningTeamId: otherTeamId };
      const gameWinner = checkGameWinner(
        afterRound.historicalRounds,
        afterRound.game_format,
      );
      if (gameWinner !== null) {
        await ops.endGame(gameWinner);
        aftermath.gameEnded = { winningTeamId: gameWinner };
      }
      break;
    }
  }

  return aftermath;
};
