import type { GameMessageData, CreateMessageInput } from "@backend/shared/data-access/repositories/game-messages.repository";
import { MESSAGE_TYPE } from "@backend/shared/data-access/repositories/game-messages.repository";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { findPlayerByUserId } from "@backend/game/access";
import type { GameMessage } from "../game-message";
import { toGameMessage } from "../game-message";

/** Wiring dependencies for the submit-message service. */
export interface SubmitMessageServiceDeps {
  createGameMessage: (input: CreateMessageInput) => Promise<GameMessageData>;
  loadGameAggregate: GameAggregateLoader;
}

/**
 * Validated input for posting a chat message.
 *
 * `content` is trimmed before persistence and capped at 1000 characters
 * (rejected with `invalid-input` if exceeded). `teamOnly` scopes the
 * resulting WebSocket event to the author's team.
 */
export interface SubmitMessageInput {
  content: string;
  teamOnly: boolean;
}

/**
 * Tagged result variants for the submit-message service.
 *
 * On `success`, `audienceTeamId` is set when `teamOnly` was true (used to
 * scope the WebSocket broadcast).
 */
export type SubmitMessageResult =
  | { status: "success"; message: GameMessage; audienceTeamId: number | undefined }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number }
  | { status: "invalid-input"; error: string };

/**
 * Builds the submit-message service.
 *
 * Validates content length, loads the game, confirms the user is a player,
 * persists a CHAT message, and returns the API-shaped result enriched with
 * the audience-team id for the broadcast.
 */
export const submitMessageService = (deps: SubmitMessageServiceDeps) =>
  async (
    gameId: string,
    userId: number,
    input: SubmitMessageInput,
  ): Promise<SubmitMessageResult> => {
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

    const messageData = await deps.createGameMessage({
      gameId: aggregate._id,
      playerId: userPlayer._id,
      teamId: userPlayer._teamId,
      teamOnly: input.teamOnly,
      messageType: MESSAGE_TYPE.CHAT,
      content: input.content.trim(),
    });

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
