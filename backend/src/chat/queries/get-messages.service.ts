import type {
  GameMessageData,
  MessageQueryParams,
} from "@backend/shared/data-access/repositories/game-messages.repository";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import { findPlayerByUserId } from "@backend/game/access";
import type { GameMessage, MessageAuthorInfo } from "../game-message";
import { toGameMessage } from "../game-message";

/**
 * Dependencies required by the service
 */
export interface GetMessagesServiceDeps {
  findMessagesByGame: (params: MessageQueryParams) => Promise<GameMessageData[]>;
  loadGameAggregate: GameAggregateLoader;
}

/**
 * Query parameters
 */
export interface GetMessagesQuery {
  since?: string; // ISO timestamp
  limit?: number;
}

/**
 * Service result types
 */
export type GetMessagesResult =
  | { status: "success"; messages: GameMessage[] }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number };

/**
 * Creates the get messages service
 */
export const getMessagesService =
  (deps: GetMessagesServiceDeps) =>
  async (
    gameId: string,
    userId: number,
    query: GetMessagesQuery = {},
  ): Promise<GetMessagesResult> => {
    const aggregate = await deps.loadGameAggregate(gameId);
    if (!aggregate) {
      return { status: "game-not-found", gameId };
    }

    const userPlayer = findPlayerByUserId(aggregate, userId);
    if (!userPlayer) {
      return { status: "unauthorized", gameId, userId };
    }

    const userTeamId = userPlayer._teamId;
    const sinceDate = query.since ? new Date(query.since) : undefined;

    // Get messages for this game
    const messageRows = await deps.findMessagesByGame({
      gameId: aggregate._id,
      since: sinceDate,
      limit: query.limit,
      requestingTeamId: userTeamId,
    });

    // Build lookup map: DB player id -> player info
    const allPlayers = aggregate.teams.flatMap((team) => team.players);
    const playerById = new Map(allPlayers.map((p) => [p._id, p]));

    // Transform to API format, enriching with player/team names from game state
    const messages: GameMessage[] = messageRows.map((row) => {
      const player = row.player_id != null ? playerById.get(row.player_id) : undefined;
      const author: MessageAuthorInfo | null = player
        ? {
            publicId: player.publicId,
            publicName: player.publicName,
            teamName: player.teamName,
          }
        : null;
      return toGameMessage(row, gameId, author);
    });

    return { status: "success", messages };
  };

export type { GameMessage } from "../game-message";
