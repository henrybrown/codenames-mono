import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";

export interface GameEventRow {
  id: number;
  public_id: string;
  game_id: number;
  event_type: string;
  card_id: number | null;
  player_id: number | null;
  round_id: number | null;
  metadata: unknown | null;
  created_at: Date;
}

export interface CreateEventInput {
  gameId: number;
  eventType: string;
  cardId?: number;
  playerId?: number;
  roundId?: number;
  metadata?: Record<string, any>;
}

export const createEvent =
  (db: Kysely<DB>) =>
  async (event: CreateEventInput): Promise<GameEventRow> => {
    try {
      const publicId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const result = await db
        .insertInto("game_events")
        .values({
          public_id: publicId,
          game_id: event.gameId,
          event_type: event.eventType,
          card_id: event.cardId ?? null,
          player_id: event.playerId ?? null,
          round_id: event.roundId ?? null,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: result.id,
        public_id: result.public_id,
        game_id: result.game_id,
        event_type: result.event_type,
        card_id: result.card_id,
        player_id: result.player_id,
        round_id: result.round_id,
        metadata: result.metadata,
        created_at: result.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create game event for game ${event.gameId}`,
        { cause: error },
      );
    }
  };

export const getEventsByGameId =
  (db: Kysely<DB>) =>
  async (gameId: number): Promise<GameEventRow[]> => {
    try {
      const results = await db
        .selectFrom("game_events")
        .selectAll()
        .where("game_id", "=", gameId)
        .orderBy("created_at", "asc")
        .orderBy("id", "asc") // Secondary sort for events in same millisecond
        .execute();

      return results.map((row) => ({
        id: row.id,
        public_id: row.public_id,
        game_id: row.game_id,
        event_type: row.event_type,
        card_id: row.card_id,
        player_id: row.player_id,
        round_id: row.round_id,
        metadata: row.metadata,
        created_at: row.created_at,
      }));
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to retrieve events for game ${gameId}`,
        { cause: error },
      );
    }
  };
