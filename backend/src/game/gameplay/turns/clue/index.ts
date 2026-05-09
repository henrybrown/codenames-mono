import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import { createResolveGameplayContext } from "../../shared/resolve-gameplay-context";

import { giveClueService } from "./give-clue.service";
import { giveClueController } from "./give-clue.controller";

export interface GiveClueDependencies {
  getGameState: GameplayStateProvider;
  gameplayHandler: GameplayHandler;
  getTurnState: TurnStateProvider;
  loadGameData: GameDataLoader;
}

export const giveClue = (logger: AppLogger) => (dependencies: GiveClueDependencies) => {
  const service = giveClueService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    getTurnState: dependencies.getTurnState,
  });

  const resolveContext = createResolveGameplayContext({
    getGameState: dependencies.getGameState,
    loadGameData: dependencies.loadGameData,
  });

  const controller = giveClueController(logger)({
    giveClue: service,
    resolveContext,
    loadGameData: dependencies.loadGameData,
  });

  return { controller, service };
};

export default giveClue;
