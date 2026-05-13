/**
 * Turn-management action factories + post-guess orchestration.
 *
 * These actions are the building blocks the gameplay handler uses to
 * mutate turn/round/game state. Each factory takes its repo deps +
 * validator and returns a function that validates then executes.
 *
 * Validation failures return `{ ok: false; message }` Results so
 * callers can decide how to surface them — most are user-correctable
 * and should be 4xx, not 500.
 *
 * `applyGuessOutcome` is the game-logic orchestrator: given the
 * outcome of a guess and the relevant ops, it decides whether the
 * turn ends, the round ends, the game ends — and runs the matching
 * ops. All within the caller's transaction.
 */
import {
  ROUND_STATE,
  GAME_STATE,
  CODEBREAKER_OUTCOME,
} from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import type {
  validateEndTurn,
  validateStartTurn,
  validateEndRound,
} from "../guess/make-guess.rules";
import type {
  TurnStatusUpdater,
  TurnCreator,
} from "@backend/shared/data-access/repositories/turns.repository";
import type {
  RoundStatusUpdater,
  RoundWinnerUpdater,
} from "@backend/shared/data-access/repositories/rounds.repository";
import type { GameStatusUpdater } from "@backend/shared/data-access/repositories/games.repository";
import {
  checkRoundWinner,
  checkGameWinner,
} from "./winning-conditions";
import { getOtherTeamId } from "@backend/game/state/helpers";

/* -------------------------------------------------------------------------- */
/* End turn                                                                   */
/* -------------------------------------------------------------------------- */

export type EndTurnActionResult =
  | { ok: true; data: Awaited<ReturnType<TurnStatusUpdater>> }
  | { ok: false; message: string };

export const createEndTurnAction = (deps: {
  updateTurnStatus: TurnStatusUpdater;
  validateEndTurn: typeof validateEndTurn;
}) => {
  return async (
    gameState: GameAggregate,
    turnId: number,
  ): Promise<EndTurnActionResult> => {
    const validation = deps.validateEndTurn(gameState);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }
    const updated = await deps.updateTurnStatus(turnId, "COMPLETED");
    return { ok: true, data: updated };
  };
};
export type EndTurnAction = ReturnType<typeof createEndTurnAction>;

/* -------------------------------------------------------------------------- */
/* Start turn                                                                 */
/* -------------------------------------------------------------------------- */

export type StartTurnActionResult =
  | { ok: true; data: Awaited<ReturnType<TurnCreator>> }
  | { ok: false; message: string };

export const createStartTurnAction = (deps: {
  createTurn: TurnCreator;
  validateStartTurn: typeof validateStartTurn;
}) => {
  return async (
    gameState: GameAggregate,
    roundId: number,
    teamId: number,
  ): Promise<StartTurnActionResult> => {
    const validation = deps.validateStartTurn(gameState);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }
    const created = await deps.createTurn({ roundId, teamId, guessesRemaining: 0 });
    return { ok: true, data: created };
  };
};
export type StartTurnAction = ReturnType<typeof createStartTurnAction>;

/* -------------------------------------------------------------------------- */
/* End round                                                                  */
/* -------------------------------------------------------------------------- */

export type EndRoundActionResult =
  | { ok: true; data: Awaited<ReturnType<RoundWinnerUpdater>> }
  | { ok: false; message: string };

export const createEndRoundAction = (deps: {
  updateRoundStatus: RoundStatusUpdater;
  updateRoundWinner: RoundWinnerUpdater;
  validateEndRound: typeof validateEndRound;
}) => {
  return async (
    gameState: GameAggregate,
    roundId: number,
    winningTeamId: number,
  ): Promise<EndRoundActionResult> => {
    const validation = deps.validateEndRound(gameState);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }
    await deps.updateRoundStatus({ roundId, status: ROUND_STATE.COMPLETED });
    const updated = await deps.updateRoundWinner({ roundId, winningTeamId });
    return { ok: true, data: updated };
  };
};
export type EndRoundAction = ReturnType<typeof createEndRoundAction>;

/* -------------------------------------------------------------------------- */
/* End game                                                                   */
/* -------------------------------------------------------------------------- */

export const createEndGameAction = (updateGameStatus: GameStatusUpdater) => {
  return async (gameState: GameAggregate, _winningTeamId: number) => {
    return await updateGameStatus(gameState._id, GAME_STATE.COMPLETED);
  };
};
export type EndGameAction = ReturnType<typeof createEndGameAction>;

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
