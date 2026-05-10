import type { GameplayStateProvider } from "@backend/game/gameplay/state/get-gameplay-state";
import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import { createResolveGameplayContext } from "../../shared/resolve-gameplay-context";

import { giveClueService } from "./give-clue.service";
import { giveClueController } from "./give-clue.controller";

export interface GiveClueDependencies {
  getGameplayState: GameplayStateProvider;
  gameplayHandler: GameplayHandler;
  getTurnState: TurnStateProvider;
  loadGameAggregate: GameAggregateLoader;
}

export const giveClue = (logger: AppLogger) => (dependencies: GiveClueDependencies) => {
  const service = giveClueService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    getTurnState: dependencies.getTurnState,
  });

  const resolveContext = createResolveGameplayContext({
    getGameplayState: dependencies.getGameplayState,
  });

  const controller = giveClueController(logger)({
    giveClue: service,
    resolveContext,
    loadGameAggregate: dependencies.loadGameAggregate,
  });

  return { controller, service };
};

export default giveClue;
