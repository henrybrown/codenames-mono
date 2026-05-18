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

/**
 * Schema for the single-player PATCH endpoint.
 *
 * `playerId` appears in both the URL path and the body; the schema
 * accepts both independently and the handler is expected to enforce they
 * match.
 */
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

/** Parsed shape of a single-player modify request. */
export type ValidatedSinglePlayerRequest = z.infer<typeof modifyPlayerSchema>;

/**
 * Schema for the batch PATCH endpoint — non-empty array of updates, each
 * carrying its own `playerId`.
 */
export const modifyBatchPlayersRequestSchema = z.object({
  params: z.object({
    gameId: z.string(),
  }),

  body: z.array(modifyPlayerSchema).min(1),

  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

/** Parsed shape of a batch modify request. */
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

/** Response schema for the single-player PATCH endpoint. */
export const singlePlayerResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    player: playerResponseSchema,
    gameId: z.string(),
  }),
});

/** Response schema for the batch PATCH endpoint. */
export const batchPlayersResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    players: z.array(playerResponseSchema),
    gameId: z.string(),
  }),
});

/** Wire-format single-player response. */
export type SinglePlayerResponse = z.infer<typeof singlePlayerResponseSchema>;
/** Wire-format batch-players response. */
export type BatchPlayersResponse = z.infer<typeof batchPlayersResponseSchema>;
