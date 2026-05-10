import type { GameEventRow } from "@backend/shared/data-access/repositories/game-events.repository";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import { findPlayerByUserId } from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";

/**
 * Transformed event for API response
 */
export interface GameEvent {
  id: string;
  gameId: string;
  timestamp: string;
  type: string;
  cardId?: string;
  playerId?: string;
  roundId?: string;
  [key: string]: any; // For metadata fields
}

/**
 * Dependencies required by the service
 */
export interface GetEventsServiceDeps {
  getEventsByGameId: (gameId: number) => Promise<GameEventRow[]>;
  loadGameAggregate: GameAggregateLoader;
}

/**
 * Service result types
 */
export type GetEventsResult =
  | { status: "success"; events: GameEvent[] }
  | { status: "game-not-found"; gameId: string }
  | { status: "unauthorized"; gameId: string; userId: number };

/**
 * Creates the get events service
 */
export const getEventsService = (logger: AppLogger) => (deps: GetEventsServiceDeps) =>
  async (gameId: string, userId: number): Promise<GetEventsResult> => {
    const aggregate = await deps.loadGameAggregate(gameId);
    if (!aggregate) {
      return { status: "game-not-found", gameId };
    }

    if (!findPlayerByUserId(aggregate, userId)) {
      return { status: "unauthorized", gameId, userId };
    }

    // Get all events for this game
    const eventRows = await deps.getEventsByGameId(aggregate._id);

    // Transform to API format
    const events: GameEvent[] = eventRows.map((row) => {
      // Parse metadata if it exists
      let metadata: Record<string, any> = {};
      if (row.metadata) {
        try {
          metadata = typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : (row.metadata as Record<string, any>);
        } catch (error) {
          logger.warn(`getEvents metadata_parse_failed: eventId=${row.public_id}`);
        }
      }

      return {
        id: row.public_id,
        gameId,
        timestamp: row.created_at.toISOString(),
        type: row.event_type,
        ...(row.card_id && { cardId: `card_${row.card_id}` }),
        ...(row.player_id && { playerId: `player_${row.player_id}` }),
        ...(row.round_id && { roundId: `round_${row.round_id}` }),
        ...metadata, // Spread metadata fields into the event object
      };
    });

    return { status: "success", events };
  };

export type GetEventsService = ReturnType<ReturnType<typeof getEventsService>>;
