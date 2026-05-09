import type { AppLogger } from "@backend/shared/logging";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type {
  GameMessageData,
  CreateMessageInput,
} from "@backend/shared/data-access/repositories/game-messages.repository";

import { submitMessageService } from "./submit-message.service";
import { submitMessageController } from "./submit-message.controller";

export interface SubmitMessageDependencies {
  getGameState: GameplayStateProvider;
  createGameMessage: (input: CreateMessageInput) => Promise<GameMessageData>;
}

export const createSubmitMessage =
  (logger: AppLogger) => (deps: SubmitMessageDependencies) => {
    const service = submitMessageService({
      createGameMessage: deps.createGameMessage,
      getGameState: deps.getGameState,
    });

    const controller = submitMessageController({
      submitMessage: service,
    });

    return {
      controller,
      service,
    };
  };

export type SubmitMessageFeature = ReturnType<ReturnType<typeof createSubmitMessage>>;
