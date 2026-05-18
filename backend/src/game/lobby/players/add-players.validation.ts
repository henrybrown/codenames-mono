import { z } from "zod";

/** Single player to add — strict (extra keys fail validation). */
export const playerSchema = z
  .object({
    playerName: z.string().min(1).max(30),
    teamName: z.string().min(1),
  })
  .strict();

/**
 * Add-players request schema.
 *
 * Body accepts either a single player object or a non-empty array — the
 * controller normalizes to an array before calling the service.
 */
export const addPlayersRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
  body: z.union([
    playerSchema,                                                         // Single player object
    z.array(playerSchema).min(1, "At least one player is required"),     // Array of players
  ]),
});

/** Parsed shape of a validated add-players request. */
export type ValidatedAddPlayersRequest = z.infer<
  typeof addPlayersRequestSchema
>;

const playerResponseSchema = z.object({
  id: z.string(),
  playerName: z.string(),
  username: z.string().optional(),
  teamName: z.string(),
  isActive: z.boolean(),
});

/** Strict response schema — extra keys fail before being sent on the wire. */
export const addPlayersResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      players: z.array(playerResponseSchema),
      gameId: z.string(),
    }),
  })
  .strict();

/** Wire-format response shape for add-players. */
export type AddPlayersResponse = z.infer<typeof addPlayersResponseSchema>;
