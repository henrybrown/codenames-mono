import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as gameRepository from "@backend/shared/data-access/repositories/games.repository";
import { createEndGameAction } from "./end-game.action";

export { createEndGameAction, type EndGameAction } from "./end-game.action";

/**
 * Binds the end-game action against a transaction-scoped repository.
 *
 * Returns the action closed over the transaction; the gameplay ops
 * registry picks it up from there.
 */
export const bindEndGameAction = (trx: TransactionContext) =>
  createEndGameAction(gameRepository.updateGameStatus(trx));

/** Transaction-bound end-game action. */
export type BoundEndGameAction = ReturnType<typeof bindEndGameAction>;
