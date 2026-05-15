import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { z } from "zod";
import { UnexpectedRepositoryError } from "./repository.errors";

export type MessageId = string;
export type GameId = number;
export type PlayerId = number;
export type TeamId = number;

export const MESSAGE_TYPE = {
  CHAT: "CHAT",
  AI_THINKING: "AI_THINKING",
  SYSTEM: "SYSTEM",
} as const;

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

export type GameMessageData = {
  id: string;
  game_id: number;
  player_id: number | null;
  team_id: number | null;
  team_only: boolean;
  message_type: MessageType;
  content: string;
  created_at: Date;
};

export type CreateMessageInput = {
  gameId: number;
  playerId?: number | null;
  teamId?: number | null;
  teamOnly?: boolean;
  messageType: MessageType;
  content: string;
};

export type MessageQueryParams = {
  gameId: number;
  since?: Date;
  limit?: number;
  requestingTeamId?: number | null;
};

export type MessageCreator = (input: CreateMessageInput) => Promise<GameMessageData>;
export type MessageFinder = (params: MessageQueryParams) => Promise<GameMessageData[]>;

export const messageTypeSchema = z.enum([
  MESSAGE_TYPE.CHAT,
  MESSAGE_TYPE.AI_THINKING,
  MESSAGE_TYPE.SYSTEM,
]);

export const createMessage =
  (db: Kysely<DB>): MessageCreator =>
  async (input) => {
    try {
      const message = await db
        .insertInto("game_messages")
        .values({
          game_id: input.gameId,
          player_id: input.playerId ?? null,
          team_id: input.teamId ?? null,
          team_only: input.teamOnly ?? false,
          message_type: input.messageType,
          content: input.content,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: message.id,
        game_id: message.game_id,
        player_id: message.player_id,
        team_id: message.team_id,
        team_only: message.team_only,
        message_type: messageTypeSchema.parse(message.message_type),
        content: message.content,
        created_at: message.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create game message for game ${input.gameId}`,
        { cause: error },
      );
    }
  };

/**
 * Filters out team-only messages when requestingTeamId doesn't match
 */
export const findMessagesByGame =
  (db: Kysely<DB>): MessageFinder =>
  async (params) => {
    try {
      let query = db.selectFrom("game_messages").selectAll().where("game_id", "=", params.gameId);

      if (params.since) {
        query = query.where("created_at", ">", params.since);
      }

      const limit = params.limit ?? 100;
      query = query.orderBy("created_at", "asc").limit(limit);

      const messages = await query.execute();

      return messages.map((msg) => ({
        id: msg.id,
        game_id: msg.game_id,
        player_id: msg.player_id,
        team_id: msg.team_id,
        team_only: msg.team_only,
        message_type: messageTypeSchema.parse(msg.message_type),
        content: msg.content,
        created_at: msg.created_at,
      }));
    } catch (error) {
      throw new UnexpectedRepositoryError(`Failed to query messages for game ${params.gameId}`, {
        cause: error,
      });
    }
  };
