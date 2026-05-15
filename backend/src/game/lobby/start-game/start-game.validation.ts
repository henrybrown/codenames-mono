import { z } from "zod";
import { PlayerResult } from "@backend/shared/data-access/repositories/players.repository";

export const startGameRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

export type ValidatedStartGameRequest = z.infer<typeof startGameRequestSchema>;

export const startGameResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      game: z.object({
        publicId: z.string(),
        status: z.string(),
      }),
    }),
  })
  .brand<"GameApiResponse">();

export type StartGameResponse = z.infer<typeof startGameResponseSchema>;

export type GameStartValidationError = {
  valid: false;
  reason: string;
};

export type GameStartValidationSuccess = {
  valid: true;
};

export type GameStartValidationResult =
  | GameStartValidationSuccess
  | GameStartValidationError;

export function validateGameCanBeStarted(
  gameStatus: string,
  players: PlayerResult[],
  aiMode: boolean = false,
): GameStartValidationResult {
  if (gameStatus !== "LOBBY") {
    return {
      valid: false,
      reason: `Cannot start game in '${gameStatus}' state`,
    };
  }

  if (!aiMode) {
    if (players.length < 4) {
      return {
        valid: false,
        reason: "Cannot start game with less than 4 players",
      };
    }

    const teamIds = [...new Set(players.map((player) => player._teamId))];
    if (teamIds.length < 2) {
      return {
        valid: false,
        reason: "Cannot start game with less than 2 teams",
      };
    }

    const playersPerTeam = teamIds.map(
      (teamId) => players.filter((player) => player._teamId === teamId).length,
    );

    if (playersPerTeam.some((count) => count < 2)) {
      return {
        valid: false,
        reason: "Each team must have at least 2 players",
      };
    }
  }

  return {
    valid: true,
  };
}
