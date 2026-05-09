import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import { createResolveGameplayContext } from "../../shared/resolve-gameplay-context";

import { makeGuessService } from "./make-guess.service";
import { makeGuessController } from "./make-guess.controller";

export interface MakeGuessDependencies {
  getGameState: GameplayStateProvider;
  gameplayHandler: GameplayHandler;
  getTurnState: TurnStateProvider;
  loadGameData: GameDataLoader;
}

export const makeGuess = (logger: AppLogger) => (dependencies: MakeGuessDependencies) => {
  const service = makeGuessService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    getTurnState: dependencies.getTurnState,
  });

  const resolveContext = createResolveGameplayContext({
    getGameState: dependencies.getGameState,
    loadGameData: dependencies.loadGameData,
  });

  const controller = makeGuessController(logger)({
    makeGuess: service,
    resolveContext,
    loadGameData: dependencies.loadGameData,
  });

  return { controller, service };
};

export default makeGuess;
