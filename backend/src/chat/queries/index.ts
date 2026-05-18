import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type {
  GameMessageData,
  MessageQueryParams,
} from "@backend/shared/data-access/repositories/game-messages.repository";

import { getMessagesService } from "./get-messages.service";
import { getMessagesController } from "./get-messages.controller";

/** Wiring dependencies for the get-messages sub-feature. */
export interface GetMessagesDependencies {
  loadGameAggregate: GameAggregateLoader;
  findMessagesByGame: (params: MessageQueryParams) => Promise<GameMessageData[]>;
}

/**
 * Builds the get-messages sub-feature.
 *
 * Returns `{ controllers, services }` so the parent chat module can mount
 * the route and expose the service to any cross-feature callers.
 */
export const createGetMessages =
  (logger: AppLogger) => (deps: GetMessagesDependencies) => {
    const service = getMessagesService({
      findMessagesByGame: deps.findMessagesByGame,
      loadGameAggregate: deps.loadGameAggregate,
    });

    const controller = getMessagesController({
      getMessages: service,
    });

    return {
      controllers: { getMessages: controller },
      services: { getMessages: service },
    };
  };

/** Public handle returned by `createGetMessages`. */
export type GetMessagesFeature = ReturnType<ReturnType<typeof createGetMessages>>;
