import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type {
  GameMessageData,
  CreateMessageInput,
} from "@backend/shared/data-access/repositories/game-messages.repository";

import { submitMessageService } from "./submit-message.service";
import { submitMessageController } from "./submit-message.controller";

/** Wiring dependencies for the submit-message sub-feature. */
export interface SubmitMessageDependencies {
  loadGameAggregate: GameAggregateLoader;
  createGameMessage: (input: CreateMessageInput) => Promise<GameMessageData>;
}

/**
 * Builds the submit-message sub-feature.
 *
 * Returns `{ controllers, services }` for the parent chat module to mount
 * the route and surface the service.
 */
export const createSubmitMessage =
  (logger: AppLogger) => (deps: SubmitMessageDependencies) => {
    const service = submitMessageService({
      createGameMessage: deps.createGameMessage,
      loadGameAggregate: deps.loadGameAggregate,
    });

    const controller = submitMessageController({
      submitMessage: service,
    });

    return {
      controllers: { submitMessage: controller },
      services: { submitMessage: service },
    };
  };

/** Public handle returned by `createSubmitMessage`. */
export type SubmitMessageFeature = ReturnType<ReturnType<typeof createSubmitMessage>>;
