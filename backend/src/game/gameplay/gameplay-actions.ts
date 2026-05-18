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
 * Creates the service-facing gameplay operation registry which all run 
 * within the same db transaction to ensure atomicity.
 *
 * `state()` loads fresh game state within the current transaction. Each
 * op calls it internally before running its action, so every op sees
 * the latest committed state. Services that need post-op state call
 * `ops.state()` themselves — same method, no extra plumbing.
 *
 * Player is owned by the handler, as a gameplay service will only ever be running 
 * operations as a single game player.
 * 
 * Current state is fetched from the db before each op - this ensures state is
 * accurate but caching may need to be implemented in the future.
 */
const buildOps = (
  trx: TransactionContext,
  initialState: GameAggregate,
  player: ActingPlayer,
) => {
  const loadGameAggregate = createGameAggregateLoader(trx);
  const gamePublicId = initialState.public_id;

  const state = async (): Promise<GameAggregate> => {
    const fresh = await loadGameAggregate(gamePublicId);
    if (!fresh) {
      throw new UnexpectedGameplayError("Game not found during reload");
    }
    return fresh;
  };

  const giveClue = bindGiveClueAction(trx);
  const makeGuess = bindMakeGuessAction(trx);
  const endTurn = bindEndTurnAction(trx);
  const startTurn = bindStartTurnAction(trx);
  const endRound = bindEndRoundAction(trx);
  const endGame = bindEndGameAction(trx);

  return {
    /** Loads fresh game state within the current transaction. */
    state,

    giveClue: async (word: string, targetCardCount: number) => {
      const result = await giveClue(await state(), player, word, targetCardCount);
      if (!result.ok) return result;
      return {
        ok: true as const,
        clue: result.data.clue,
        turn: result.data.turn,
      };
    },

    /** Codebreaker records a guess. The post-guess cascade is the caller's responsibility. */
    makeGuess: async (cardWord: string) => {
      const result = await makeGuess(await state(), player, cardWord);
      if (!result.ok) return result;
      return { ok: true as const, guess: result.data };
    },

    endTurn: async (turnId: number) => {
      const result = await endTurn(await state(), turnId);
      if (!result.ok) return result;
      return { ok: true as const };
    },

    startTurn: async (roundId: number, teamId: number) => {
      const result = await startTurn(await state(), roundId, teamId);
      if (!result.ok) return result;
      return { ok: true as const, newTurn: result.data };
    },

    endRound: async (roundId: number, winningTeamId: number) => {
      const result = await endRound(await state(), roundId, winningTeamId);
      if (!result.ok) return result;
      return { ok: true as const };
    },

    endGame: async (winningTeamId: number) => {
      await endGame(await state(), winningTeamId);
      return { ok: true as const };
    },
  };
};

/**
 * Operation registry exposed inside a gameplay transaction.
 *
 * Each op is a `Result`-returning async function — successful ops return
 * `{ ok: true, ... }`, expected business failures return
 * `{ ok: false, message }`. Invariant violations throw.
 */
export type GameplayOperations = ReturnType<typeof buildOps>;

/**
 * Handler signature for executing operations inside a game transaction.
 *
 * Takes the initial game state and acting player, opens a transaction,
 * builds the ops registry, and invokes `operation` with it. The return
 * type is whatever `operation` returns, so callers can shape their own
 * results from inside the transaction.
 */
export type GameplayHandler = <R>(
  initialState: GameAggregate,
  player: ActingPlayer,
  operation: (ops: GameplayOperations) => Promise<R>,
) => Promise<R>;

/**
 * Builds the gameplay handler factory.
 *
 * Returns `{ handler }` where `handler` opens a transaction and runs a
 * gameplay operation against the ops registry. The single-handler shape
 * leaves room for future siblings (e.g. read-only handlers) without
 * widening the call surface.
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
