import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { makeGuessService } from "./make-guess.service";
import { makeGuessController } from "./make-guess.controller";

export interface MakeGuessDependencies {
  gameplayHandler: GameplayHandler;
  getTurnState: TurnStateProvider;
  loadGameAggregate: GameAggregateLoader;
}

export const makeGuess = (logger: AppLogger) => (dependencies: MakeGuessDependencies) => {
  const service = makeGuessService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    getTurnState: dependencies.getTurnState,
  });

  const controller = makeGuessController(logger)({
    makeGuess: service,
    loadGameAggregate: dependencies.loadGameAggregate,
  });

  return { controller, service };
};

export default makeGuess;
