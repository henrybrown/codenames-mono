import type { GameMessageData, CreateMessageInput } from "@backend/shared/data-access/repositories/game-messages.repository";
import { MESSAGE_TYPE } from "@backend/shared/data-access/repositories/game-messages.repository";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { findPlayerByUserId } from "@backend/game/access";
import type { GameMessage } from "../game-message";
import { toGameMessage } from "../game-message";

/**
 * Dependencies required by the service
 */
export interface SubmitMessageServiceDeps {
  createGameMessage: (input: CreateMessageInput) => Promise<GameMessageData>;
  loadGameAggregate: GameAggregateLoader;
}

/**
 * Submit message input
 */
export interface SubmitMessageInput {
  content: string;
  teamOnly: boolean;
}

/**
 * Service result types
 */
export type SubmitMessageResult =
  | { status: "success"; message: GameMessage; audienceTeamId: number | undefined }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number }
  | { status: "invalid-input"; error: string };

/**
 * Creates the submit message service
 */
export const submitMessageService = (deps: SubmitMessageServiceDeps) =>
  async (
    gameId: string,
    userId: number,
    input: SubmitMessageInput,
  ): Promise<SubmitMessageResult> => {
    // Validate input
    if (!input.content || input.content.trim().length === 0) {
      return { status: "invalid-input", error: "Message content cannot be empty" };
    }

    if (input.content.length > 1000) {
      return { status: "invalid-input", error: "Message content cannot exceed 1000 characters" };
    }

    const aggregate = await deps.loadGameAggregate(gameId);
    if (!aggregate) {
      return { status: "game-not-found", gameId };
    }

    const userPlayer = findPlayerByUserId(aggregate, userId);
    if (!userPlayer) {
      return { status: "unauthorized", gameId, userId };
    }

    // Create the message
    const messageData = await deps.createGameMessage({
      gameId: aggregate._id,
      playerId: userPlayer._id,
      teamId: userPlayer._teamId,
      teamOnly: input.teamOnly,
      messageType: MESSAGE_TYPE.CHAT,
      content: input.content.trim(),
    });

    // Transform to API format (enriched with player info from game state)
    const message: GameMessage = toGameMessage(messageData, gameId, {
      publicId: userPlayer.publicId,
      publicName: userPlayer.publicName,
      teamName: userPlayer.teamName,
    });

    return {
      status: "success",
      message,
      // Surface the team scoping so the controller can choose the right
      // websocket audience without re-deriving it.
      audienceTeamId: input.teamOnly ? userPlayer._teamId : undefined,
    };
  };

export type { GameMessage } from "../game-message";
