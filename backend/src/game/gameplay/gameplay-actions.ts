import { Kysely } from "kysely";
import { DB } from "@backend/shared/db/db.types";
import { TransactionContext } from "@backend/shared/data-access/transaction-handler";

import { createGameAggregateLoader } from "@backend/game/state";
import { UnexpectedGameplayError } from "./errors/gameplay.errors";
import type { GameAggregate } from "@backend/game/state/types";
import type { ActingPlayer } from "./turns/types";

import { bindGiveClueAction } from "./turns/clue";
import { bindMakeGuessAction } from "./turns/guess";
import { bindStartTurnAction } from "./turns/start";
import { bindEndTurnAction } from "./turns/end";
import { bindEndRoundAction } from "./rounds";
import { bindEndGameAction } from "./games";

/**
 * Creates the service-facing ops registry for a single gameplay
 * transaction.
 *
 * Each method binds its sub-feature action to the transaction, calls it
 * against the handler's tracked currentState (with the acting player
 * auto-injected for ops that need it), and reloads state on success.
 * Services read `ops.state` for the always-fresh view.
 *
 * Player is owned by the handler — services don't pass it through. The
 * acting player feeds into give-clue / make-guess; end-turn /
 * start-turn / end-round / end-game don't read it.
 */
const buildOps = (
  trx: TransactionContext,
  initialState: GameAggregate,
  player: ActingPlayer,
) => {
  const loadGameAggregate = createGameAggregateLoader(trx);
  let currentState = initialState;

  const reload = async (): Promise<void> => {
    const fresh = await loadGameAggregate(initialState.public_id);
    if (!fresh) {
      throw new UnexpectedGameplayError("Game not found during reload");
    }
    currentState = fresh;
  };

  const giveClue = bindGiveClueAction(trx);
  const makeGuess = bindMakeGuessAction(trx);
  const endTurn = bindEndTurnAction(trx);
  const startTurn = bindStartTurnAction(trx);
  const endRound = bindEndRoundAction(trx);
  const endGame = bindEndGameAction(trx);

  return {
    get state(): GameAggregate {
      return currentState;
    },

    /** Codemaster gives a clue. */
    giveClue: async (word: string, targetCardCount: number) => {
      const result = await giveClue(currentState, player, word, targetCardCount);
      if (!result.ok) return result;
      await reload();
      return {
        ok: true as const,
        clue: result.data.clue,
        turn: result.data.turn,
      };
    },

    /** Codebreaker records a guess. The post-guess cascade is the caller's responsibility. */
    makeGuess: async (cardWord: string) => {
      const result = await makeGuess(currentState, player, cardWord);
      if (!result.ok) return result;
      await reload();
      return { ok: true as const, guess: result.data };
    },

    /** Ends the current turn. */
    endTurn: async (turnId: number) => {
      const result = await endTurn(currentState, turnId);
      if (!result.ok) return result;
      await reload();
      return { ok: true as const };
    },

    /** Starts a new turn for a team. */
    startTurn: async (roundId: number, teamId: number) => {
      const result = await startTurn(currentState, roundId, teamId);
      if (!result.ok) return result;
      await reload();
      return { ok: true as const, newTurn: result.data };
    },

    /** Ends the current round with a winner. */
    endRound: async (roundId: number, winningTeamId: number) => {
      const result = await endRound(currentState, roundId, winningTeamId);
      if (!result.ok) return result;
      await reload();
      return { ok: true as const };
    },

    /** Ends the game. */
    endGame: async (winningTeamId: number) => {
      await endGame(currentState, winningTeamId);
      await reload();
      return { ok: true as const };
    },
  };
};

/**
 * Type representing all operations available within gameplay transactions
 */
export type GameplayOperations = ReturnType<typeof buildOps>;

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
      const ops = buildOps(trx, initialState, player);
      return operation(ops);
    });
  };

  return { handler };
};
