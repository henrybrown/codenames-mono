import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as roundsRepository from "@backend/shared/data-access/repositories/rounds.repository";
import { createEndRoundAction } from "./end-round.action";
import { validateEndRound } from "./end-round.rules";

export {
  createEndRoundAction,
  type EndRoundAction,
  type EndRoundActionResult,
} from "./end-round.action";
export {
  validateEndRound,
  type EndRoundValidGameState,
} from "./end-round.rules";
export {
  getTeamScores,
  checkRoundWinner,
  checkGameWinner,
} from "./winning-conditions";

/**
 * Binds the end-round action against a transaction-scoped repository.
 *
 * Returns the action closed over the transaction; ready to be wired into
 * the ops registry.
 */
export const bindEndRoundAction = (trx: TransactionContext) =>
  createEndRoundAction({
    updateRoundStatus: roundsRepository.updateRoundStatus(trx),
    updateRoundWinner: roundsRepository.updateRoundWinner(trx),
    validateEndRound,
  });

/** Transaction-bound end-round action. */
export type BoundEndRoundAction = ReturnType<typeof bindEndRoundAction>;
