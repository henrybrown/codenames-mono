import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as gameRepository from "@backend/shared/data-access/repositories/games.repository";
import { createEndGameAction } from "./end-game.action";

export { createEndGameAction, type EndGameAction } from "./end-game.action";

/**
 * Binds the end-game action to a transaction. Returns a function that
 * the gameplay ops registry can invoke.
 */
export const bindEndGameAction = (trx: TransactionContext) =>
  createEndGameAction(gameRepository.updateGameStatus(trx));

export type BoundEndGameAction = ReturnType<typeof bindEndGameAction>;
