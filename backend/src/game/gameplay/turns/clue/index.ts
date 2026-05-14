import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import { giveClueService } from "./give-clue.service";
import { giveClueController } from "./give-clue.controller";
import { giveClueToTurn } from "./give-clue.action";
import { validate as validateGiveClue, validateClueWord } from "./give-clue.rules";

export interface GiveClueDependencies {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

export const giveClue = (logger: AppLogger) => (dependencies: GiveClueDependencies) => {
  const service = giveClueService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    loadTurn: dependencies.loadTurn,
  });

  const controller = giveClueController(logger)({
    giveClue: service,
    loadGameAggregate: dependencies.loadGameAggregate,
  });

  return {
    controllers: { giveClue: controller },
    services: { giveClue: service },
  };
};

export default giveClue;

/**
 * Binds the give-clue action to a transaction. Returns a function that
 * the gameplay ops registry can invoke.
 *
 * All repos + validators are baked in. The caller only needs trx.
 */
export const bindGiveClueAction = (trx: TransactionContext) =>
  giveClueToTurn(
    turnsRepository.createClue(trx),
    turnsRepository.updateTurnGuesses(trx),
    validateGiveClue,
    validateClueWord,
  );

export type BoundGiveClueAction = ReturnType<typeof bindGiveClueAction>;
