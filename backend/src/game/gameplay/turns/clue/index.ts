import type { TurnLoader } from "@backend/game/state/load-turn";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { giveClueService } from "./give-clue.service";
import { giveClueController } from "./give-clue.controller";

export interface GiveClueDependencies {
  gameplayHandler: GameplayHandler;
  getTurnState: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

export const giveClue = (logger: AppLogger) => (dependencies: GiveClueDependencies) => {
  const service = giveClueService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    getTurnState: dependencies.getTurnState,
  });

  const controller = giveClueController(logger)({
    giveClue: service,
    loadGameAggregate: dependencies.loadGameAggregate,
  });

  return { controller, service };
};

export default giveClue;
