import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { createStartTurnService } from "./start-turn.service";
import { createStartTurnController } from "./start-turn.controller";

export interface StartTurnDependencies {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
}

export const startTurn = (logger: AppLogger) => (deps: StartTurnDependencies) => {
  const service = createStartTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const controller = createStartTurnController(logger)({
    startTurn: service,
    loadGameAggregate: deps.loadGameAggregate,
  });
  return {
    controllers: { startTurn: controller },
    services: { startTurn: service },
  };
};

export type {
  StartTurnService,
  StartTurnResult,
} from "./start-turn.service";

export {
  createStartTurnAction,
  type StartTurnAction,
  type StartTurnActionResult,
} from "./start-turn.action";

export {
  validateStartTurn,
  type StartTurnValidGameState,
} from "./start-turn.rules";
