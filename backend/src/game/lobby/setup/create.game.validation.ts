import { z } from "zod";
import { GAME_TYPE, GAME_FORMAT } from "@codenames/shared/types";

/** Strict request schema — `aiMode` defaults to false. */
export const createGameRequestSchema = z
  .object({
    gameType: z.enum([GAME_TYPE.SINGLE_DEVICE, GAME_TYPE.MULTI_DEVICE]),
    gameFormat: z.enum([
      GAME_FORMAT.QUICK,
      GAME_FORMAT.BEST_OF_THREE,
      GAME_FORMAT.ROUND_ROBIN,
    ]),
    aiMode: z.boolean().optional().default(false),
  })
  .strict();

/** Parsed shape of a validated create-game request. */
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;

/** Strict response schema for create-game. */
export const createGameResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      game: z.object({
        publicId: z.string().nonempty(),
        gameType: z.enum([GAME_TYPE.SINGLE_DEVICE, GAME_TYPE.MULTI_DEVICE]),
        gameFormat: z.enum([
          GAME_FORMAT.QUICK,
          GAME_FORMAT.BEST_OF_THREE,
          GAME_FORMAT.ROUND_ROBIN,
        ]),
        createdAt: z.date(),
      }),
    }),
  })
  .strict();

/** Wire-format response shape for create-game. */
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;
