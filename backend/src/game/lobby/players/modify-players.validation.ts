import { z } from "zod";

/**
 * Modify player schema used in both individual and batch operations. Only playerId is mandatory
 * as the other fields can be optionally updated.
 */
export const modifyPlayerSchema = z.object({
  playerId: z.string().uuid("Player ID must be a valid UUID"),
  teamName: z.string().optional(),
  playerName: z.string().min(1).max(30).optional(),
});

export const modifySinglePlayerRequestSchema = z.object({
  params: z.object({
    gameId: z.string(),
    playerId: z.string().uuid("Player ID must be a valid UUID"),
  }),

  body: modifyPlayerSchema,

  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

export type ValidatedSinglePlayerRequest = z.infer<typeof modifyPlayerSchema>;

export const modifyBatchPlayersRequestSchema = z.object({
  params: z.object({
    gameId: z.string(),
  }),

  body: z.array(modifyPlayerSchema).min(1),

  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

export type ValidatedBatchPlayersRequest = z.infer<
  typeof modifyBatchPlayersRequestSchema
>;

const playerResponseSchema = z.object({
  id: z.string(),
  playerName: z.string(),
  username: z.string().optional(),
  teamName: z.string(),
  isActive: z.boolean(),
});

export const singlePlayerResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    player: playerResponseSchema,
    gameId: z.string(),
  }),
});

export const batchPlayersResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    players: z.array(playerResponseSchema),
    gameId: z.string(),
  }),
});

export type SinglePlayerResponse = z.infer<typeof singlePlayerResponseSchema>;
export type BatchPlayersResponse = z.infer<typeof batchPlayersResponseSchema>;
