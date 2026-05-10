import type { GameMessageData, CreateMessageInput } from "@backend/shared/data-access/repositories/game-messages.repository";
import { MESSAGE_TYPE } from "@backend/shared/data-access/repositories/game-messages.repository";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/get-gameplay-state";
import type { GameMessage } from "../game-message";
import { toGameMessage } from "../game-message";

/**
 * Dependencies required by the service
 */
export interface SubmitMessageServiceDeps {
  createGameMessage: (input: CreateMessageInput) => Promise<GameMessageData>;
  getGameplayState: GameplayStateProvider;
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

    // Verify user has access to this game and get their team
    const gameState = await deps.getGameplayState({ gameId, userId });

    if (gameState.status === "game-not-found") {
      return { status: "game-not-found", gameId };
    }

    if (gameState.status !== "found") {
      return { status: "unauthorized", gameId, userId };
    }

    // Find the user's player and team
    const allPlayers = gameState.data.teams.flatMap((team) => team.players);
    const userPlayer = allPlayers.find((p) => p._userId === userId);

    if (!userPlayer) {
      return { status: "unauthorized", gameId, userId };
    }

    // Create the message
    const messageData = await deps.createGameMessage({
      gameId: gameState.data._id,
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
