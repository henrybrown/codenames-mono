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
import * as turnActions from "./turns/shared/turn-actions";
import { validate as validateGiveClue, validateClueWord } from "./turns/clue/give-clue.rules";

import { createGameAggregateLoader } from "@backend/game/state";
import { UnexpectedGameplayError } from "./errors/gameplay.errors";
import type { GameAggregate } from "@backend/game/state/types";
import type { ActingPlayer } from "./turns/types";

/**
 * Creates game-scoped gameplay operations for use within a transaction.
 *
 * Ops know which game they operate on, which player is acting, and reload
 * state internally after mutations. The player parameter feeds into give-
 * clue and make-guess actions; end-turn / start-turn / end-round / end-
 * game don't read it (they're not actor-attributable in the same way).
 */
export const gameplayOperations = (
  trx: TransactionContext,
  initialState: GameAggregate,
  player: ActingPlayer,
) => {
  const gamePublicId = initialState.public_id;

  const loadGameAggregate = createGameAggregateLoader(trx);

  /** Reloads game state within the transaction. */
  const reload = async (): Promise<GameAggregate> => {
    const state = await loadGameAggregate(gamePublicId);
    if (!state) throw new UnexpectedGameplayError("Game not found during reload");
    return state;
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

  const endTurnAction = turnActions.createEndTurnAction({
    updateTurnStatus: turnRepository.updateTurnStatus(trx),
    validateEndTurn: makeGuessRules.validateEndTurn,
  });

  const startTurnAction = turnActions.createStartTurnAction({
    createTurn: turnRepository.createTurn(trx),
    validateStartTurn: makeGuessRules.validateStartTurn,
  });

  const endRoundAction = turnActions.createEndRoundAction({
    updateRoundStatus: roundsRepository.updateRoundStatus(trx),
    updateRoundWinner: roundsRepository.updateRoundWinner(trx),
    validateEndRound: makeGuessRules.validateEndRound,
  });

  const endGameAction = turnActions.createEndGameAction(
    gameRepository.updateGameStatus(trx),
  );

  return {
    /** Codemaster gives a clue. Reloads state, validates, executes, returns fresh state. */
    giveClue: async (word: string, count: number) => {
      const currentState = await reload();
      const result = await giveClueAction(currentState, player, word, count);
      const freshState = await reload();
      return { ...result, state: freshState };
    },

    /** Codebreaker makes a guess. Reloads state, validates, executes, returns fresh state. */
    makeGuess: async (cardWord: string) => {
      const currentState = await reload();
      const result = await makeGuessAction(currentState, player, cardWord);
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
 * Handler type: takes initial game state + acting player + operation
 * function, runs in a transaction.
 */
export type GameplayHandler = <R>(
  initialState: GameAggregate,
  player: ActingPlayer,
  operation: (ops: GameplayOperations) => Promise<R>,
) => Promise<R>;

/**
 * Creates gameplay action components with game-scoped transactional handler
 */
export const gameplayActions = (dbContext: Kysely<DB>) => {
  const handler: GameplayHandler = async (initialState, player, operation) => {
    return dbContext.transaction().execute(async (trx) => {
      const ops = gameplayOperations(trx, initialState, player);
      return operation(ops);
    });
  };

  return { handler };
};
