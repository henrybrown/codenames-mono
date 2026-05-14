import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { createEndTurnService } from "./end-turn.service";
import { createEndTurnController } from "./end-turn.controller";

export interface EndTurnDependencies {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
}

export const endTurn = (logger: AppLogger) => (deps: EndTurnDependencies) => {
  const service = createEndTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const controller = createEndTurnController(logger)({
    endTurn: service,
    loadGameAggregate: deps.loadGameAggregate,
  });
  return {
    controllers: { endTurn: controller },
    services: { endTurn: service },
  };
};

export type {
  EndTurnService,
  EndTurnResult,
} from "./end-turn.service";

export {
  createEndTurnAction,
  type EndTurnAction,
  type EndTurnActionResult,
} from "./end-turn.action";

export {
  validateEndTurn,
  type EndTurnValidGameState,
} from "./end-turn.rules";
