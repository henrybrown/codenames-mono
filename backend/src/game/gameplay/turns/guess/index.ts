import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { makeGuessService } from "./make-guess.service";
import { makeGuessController } from "./make-guess.controller";

export interface MakeGuessDependencies {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

export const makeGuess = (logger: AppLogger) => (dependencies: MakeGuessDependencies) => {
  const service = makeGuessService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    loadTurn: dependencies.loadTurn,
  });

  const controller = makeGuessController(logger)({
    makeGuess: service,
    loadGameAggregate: dependencies.loadGameAggregate,
  });

  return { controller, service };
};

export default makeGuess;
