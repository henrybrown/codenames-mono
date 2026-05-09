import type { AppLogger } from "@backend/shared/logging";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type {
  GameMessageData,
  MessageQueryParams,
} from "@backend/shared/data-access/repositories/game-messages.repository";

import { getMessagesService } from "./get-messages.service";
import { getMessagesController } from "./get-messages.controller";

export interface GetMessagesDependencies {
  getGameState: GameplayStateProvider;
  findMessagesByGame: (params: MessageQueryParams) => Promise<GameMessageData[]>;
}

export const createGetMessages =
  (logger: AppLogger) => (deps: GetMessagesDependencies) => {
    const service = getMessagesService({
      findMessagesByGame: deps.findMessagesByGame,
      getGameState: deps.getGameState,
    });

    const controller = getMessagesController({
      getMessages: service,
    });

    return {
      controller,
      service,
    };
  };

export type GetMessagesFeature = ReturnType<ReturnType<typeof createGetMessages>>;
