import { z } from "zod";

export const playerSchema = z
  .object({
    playerName: z.string().min(1).max(30),
    teamName: z.string().min(1),
  })
  .strict();

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

export const addPlayersResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      players: z.array(playerResponseSchema),
      gameId: z.string(),
    }),
  })
  .strict();

export type AddPlayersResponse = z.infer<typeof addPlayersResponseSchema>;
