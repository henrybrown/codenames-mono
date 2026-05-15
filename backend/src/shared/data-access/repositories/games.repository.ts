import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import {
  GameType,
  GameFormat,
  GAME_TYPE,
  GAME_FORMAT,
  GAME_STATE,
  GameState,
} from "@codenames/shared/types";
import { z } from "zod";

export type PublicId = string;
export type InternalId = number;

export type GameData = {
  _id: number;
  created_at: Date;
  updated_at?: Date | null;
  public_id: string;
  status: GameState;
  game_type: GameType;
  game_format: GameFormat;
  ai_mode: boolean;
  host_user_id: number;
};

export type GameInput = {
  publicId: string;
  gameType: GameType;
  gameFormat: GameFormat;
  aiMode?: boolean;
  hostUserId: number;
};

export type GameResult = {
  _id: number;
  created_at: Date;
  updated_at?: Date | null;
};

export type GameFinder<T extends InternalId | PublicId> = (
  identifier: T,
) => Promise<GameData | null>;

export type GameCreator = ({
  publicId,
  gameType,
  gameFormat,
}: GameInput) => Promise<GameResult>;

export type GameStatusUpdater = (
  gameId: InternalId,
  statusName: GameState,
) => Promise<GameData>;

/**
 * Zod schemas needed due to generated postgrest enum types returning "string" from Kysely query.
 * Other column primative types are typesafe through types generated through kysely-codegen.
 */
export const gameTypeSchema = z.enum([
  GAME_TYPE.SINGLE_DEVICE,
  GAME_TYPE.MULTI_DEVICE,
]);

export const gameFormatSchema = z.enum([
  GAME_FORMAT.QUICK,
  GAME_FORMAT.BEST_OF_THREE,
  GAME_FORMAT.ROUND_ROBIN,
]);

export const gameStateSchema = z.enum([
  GAME_STATE.LOBBY,
  GAME_STATE.PAUSED,
  GAME_STATE.IN_PROGRESS,
  GAME_STATE.COMPLETED,
  GAME_STATE.ABANDONED,
]);

export const findGameByPublicId =
  (db: Kysely<DB>): GameFinder<PublicId> =>
  async (publicId) => {
    const game = await db
      .selectFrom("games")
      .innerJoin("game_status", "games.status_id", "game_status.id")
      .select([
        "games.id",
        "games.created_at",
        "games.updated_at",
        "games.public_id",
        "games.game_type",
        "games.game_format",
        "games.ai_mode",
        "games.host_user_id",
        "game_status.status_name as status",
      ])
      .where("games.public_id", "=", publicId)
      .executeTakeFirst();

    return game
      ? {
          _id: game.id,
          created_at: game.created_at || null,
          updated_at: game.updated_at || null,
          public_id: game.public_id,
          status: gameStateSchema.parse(game.status),
          game_type: gameTypeSchema.parse(game.game_type),
          game_format: gameFormatSchema.parse(game.game_format),
          ai_mode: game.ai_mode,
          host_user_id: game.host_user_id!,
        }
      : null;
  };

export const findGameById =
  (db: Kysely<DB>): GameFinder<InternalId> =>
  async (gameId) => {
    const game = await db
      .selectFrom("games")
      .innerJoin("game_status", "games.status_id", "game_status.id")
      .select([
        "games.id",
        "games.created_at",
        "games.updated_at",
        "games.public_id",
        "games.game_type",
        "games.game_format",
        "games.ai_mode",
        "games.host_user_id",
        "game_status.status_name as status",
      ])
      .where("games.id", "=", gameId)
      .executeTakeFirst();

    return game
      ? {
          _id: game.id,
          created_at: game.created_at,
          updated_at: game.updated_at,
          public_id: game.public_id,
          status: gameStateSchema.parse(game.status),
          game_type: gameTypeSchema.parse(game.game_type),
          game_format: gameFormatSchema.parse(game.game_format),
          ai_mode: game.ai_mode,
          host_user_id: game.host_user_id!,
        }
      : null;
  };

export const createGame =
  (db: Kysely<DB>): GameCreator =>
  async (gameInput) => {
    const now = new Date();
    const insertedGame = await db
      .insertInto("games")
      .values({
        public_id: gameInput.publicId,
        status_id: 1,
        created_at: now,
        updated_at: now,
        game_type: gameInput.gameType,
        game_format: gameInput.gameFormat,
        ai_mode: gameInput.aiMode ?? false,
        host_user_id: gameInput.hostUserId,
      })
      .returning(["id", "created_at", "updated_at"])
      .executeTakeFirstOrThrow();

    return {
      _id: insertedGame.id,
      created_at: insertedGame.created_at,
      updated_at: insertedGame.updated_at || null,
    };
  };

export const updateGameStatus =
  (db: Kysely<DB>): GameStatusUpdater =>
  async (gameId, statusName) => {
    const status = await db
      .selectFrom("game_status")
      .where("status_name", "=", statusName)
      .select(["id"])
      .executeTakeFirstOrThrow();

    const now = new Date();
    const updatedGame = await db
      .updateTable("games")
      .set({
        status_id: status.id,
        updated_at: now,
      })
      .where("id", "=", gameId)
      .returning([
        "id",
        "created_at",
        "updated_at",
        "public_id",
        "game_type",
        "game_format",
        "ai_mode",
        "host_user_id",
      ])
      .executeTakeFirstOrThrow();

    const gameWithStatus = {
      _id: updatedGame.id,
      created_at: updatedGame.created_at,
      updated_at: updatedGame.updated_at || null,
      public_id: updatedGame.public_id,
      status: gameStateSchema.parse(statusName),
      game_type: gameTypeSchema.parse(updatedGame.game_type),
      game_format: gameFormatSchema.parse(updatedGame.game_format),
      ai_mode: updatedGame.ai_mode,
      host_user_id: updatedGame.host_user_id!,
    };

    return gameWithStatus;
  };
