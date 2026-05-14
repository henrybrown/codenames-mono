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
 * Binds the end-round action to a transaction. Returns a function that
 * the gameplay ops registry can invoke.
 */
export const bindEndRoundAction = (trx: TransactionContext) =>
  createEndRoundAction({
    updateRoundStatus: roundsRepository.updateRoundStatus(trx),
    updateRoundWinner: roundsRepository.updateRoundWinner(trx),
    validateEndRound,
  });

export type BoundEndRoundAction = ReturnType<typeof bindEndRoundAction>;
