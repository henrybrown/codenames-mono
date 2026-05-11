import { Kysely } from "kysely";
import { DB } from "@backend/shared/db/db.types";
import { TransactionContext } from "@backend/shared/data-access/transaction-handler";

import * as cardsRepository from "@backend/shared/data-access/repositories/cards.repository";
import * as turnRepository from "@backend/shared/data-access/repositories/turns.repository";
import * as roundsRepository from "@backend/shared/data-access/repositories/rounds.repository";
import * as gameRepository from "@backend/shared/data-access/repositories/games.repository";
import * as gameEventsRepository from "@backend/shared/data-access/repositories/game-events.repository";
import * as giveClueActions from "./turns/clue/give-clue.actions";
import * as makeGuessActions from "./turns/guess/make-guess.actions";
import * as makeGuessRules from "./turns/guess/make-guess.rules";
import { validate as validateGiveClue, validateClueWord } from "./turns/clue/give-clue.rules";

import { createGameAggregateLoader } from "@backend/game/state";
import { UnexpectedGameplayError } from "./errors/gameplay.errors";
import type { GameAggregate } from "@backend/game/state/types";

/**
 * Creates game-scoped gameplay operations for use within a transaction.
 *
 * Ops know which game they operate on, reload state internally after mutations,
 * and never require callers to pass state or remember to refresh.
 */
export const gameplayOperations = (trx: TransactionContext, initialState: GameAggregate) => {
  const gamePublicId = initialState.public_id;
  const playerContext = initialState.playerContext;

  const loadGameAggregate = createGameAggregateLoader(trx);

  /** Reloads game state within the transaction, preserving the original playerContext */
  const reload = async (): Promise<GameAggregate> => {
    const state = await loadGameAggregate(gamePublicId);
    if (!state) throw new UnexpectedGameplayError("Game not found during reload");
    return { ...state, playerContext };
  };

  // Build the underlying action functions
  const giveClueAction = giveClueActions.giveClueToTurn(
    turnRepository.createClue(trx),
    turnRepository.updateTurnGuesses(trx),
    validateGiveClue,
    validateClueWord,
  );

  const makeGuessAction = makeGuessActions.createMakeGuessAction({
    updateCards: cardsRepository.updateCards(trx),
    createGuess: turnRepository.createGuess(trx),
    updateTurnGuesses: turnRepository.updateTurnGuesses(trx),
    createEvent: gameEventsRepository.createEvent(trx),
    validateMakeGuess: makeGuessRules.validateMakeGuess,
  });

  const endTurnAction = makeGuessActions.createEndTurnAction({
    updateTurnStatus: turnRepository.updateTurnStatus(trx),
    validateEndTurn: makeGuessRules.validateEndTurn,
  });

  const startTurnAction = makeGuessActions.createStartTurnAction({
    createTurn: turnRepository.createTurn(trx),
    validateStartTurn: makeGuessRules.validateStartTurn,
  });

  const endRoundAction = makeGuessActions.createEndRoundAction({
    updateRoundStatus: roundsRepository.updateRoundStatus(trx),
    updateRoundWinner: roundsRepository.updateRoundWinner(trx),
    validateEndRound: makeGuessRules.validateEndRound,
  });

  const endGameAction = makeGuessActions.createEndGameAction(
    gameRepository.updateGameStatus(trx),
  );

  return {
    /** Codemaster gives a clue. Reloads state, validates, executes, returns fresh state. */
    giveClue: async (word: string, count: number) => {
      const currentState = await reload();
      const result = await giveClueAction(currentState, word, count);
      const freshState = await reload();
      return { ...result, state: freshState };
    },

    /** Codebreaker makes a guess. Reloads state, validates, executes, returns fresh state. */
    makeGuess: async (cardWord: string) => {
      const currentState = await reload();
      const result = await makeGuessAction(currentState, cardWord);
      const freshState = await reload();
      return { ...result, state: freshState };
    },

    /** Ends the current turn. Returns fresh state. */
    endTurn: async (turnId: number) => {
      const state = await reload();
      await endTurnAction(state, turnId);
      return await reload();
    },

    /** Starts a new turn for a team. Returns fresh state + the new turn record. */
    startTurn: async (roundId: number, teamId: number) => {
      const state = await reload();
      const newTurn = await startTurnAction(state, roundId, teamId);
      const freshState = await reload();
      return { newTurn, state: freshState };
    },

    /** Ends the current round with a winner. Returns fresh state. */
    endRound: async (roundId: number, winningTeamId: number) => {
      const state = await reload();
      await endRoundAction(state, roundId, winningTeamId);
      return await reload();
    },

    /** Ends the game. Returns fresh state. */
    endGame: async (winningTeamId: number) => {
      const state = await reload();
      await endGameAction(state, winningTeamId);
      return await reload();
    },
  };
};

/**
 * Type representing all operations available within gameplay transactions
 */
export type GameplayOperations = ReturnType<typeof gameplayOperations>;

/**
 * Handler type: takes initial game state + operation function, runs in transaction.
 */
export type GameplayHandler = <R>(
  initialState: GameAggregate,
  operation: (ops: GameplayOperations) => Promise<R>,
) => Promise<R>;

/**
 * Creates gameplay action components with game-scoped transactional handler
 */
export const gameplayActions = (dbContext: Kysely<DB>) => {
  const handler: GameplayHandler = async (initialState, operation) => {
    return dbContext.transaction().execute(async (trx) => {
      const ops = gameplayOperations(trx, initialState);
      return operation(ops);
    });
  };

  return { handler };
};
