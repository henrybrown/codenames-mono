import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { getGameStateService } from "./get-game.service";
import { PLAYER_ROLE } from "@codenames/shared/types";
import { z } from "zod";

/**
 * Request validation schema for game state retrieval
 */
export const gameStateRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
  }),
  query: z.object({
    playerId: z.string().min(1).optional(),
    role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]).optional(),
  }).refine(
    (data) => !(data.playerId && data.role),
    "Provide role or playerId, not both",
  ),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
});

export type ValidatedGameStateRequest = z.infer<typeof gameStateRequestSchema>;

export type Dependencies = {
  getGameState: ReturnType<ReturnType<typeof getGameStateService>>;
};

export const getGameStateController =
  ({ getGameState }: Dependencies) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedRequest = gameStateRequestSchema.parse({
        params: req.params,
        query: req.query,
        auth: req.auth,
      });

      const result = await getGameState({
        gameId: validatedRequest.params.gameId,
        playerId: validatedRequest.query.playerId || null,
        userId: validatedRequest.auth.userId,
        role: (validatedRequest.query.role as "CODEMASTER" | "CODEBREAKER") || null,
      });

      if (result.success) {
        res.status(200).json({ success: true, data: { game: result.data } });
      } else {
        if (result.error.status === "game-not-found") {
          res.status(404).json({
            success: false,
            error: "Game not found or you are not a player in this game",
            details: { code: "game-not-found", gameId: result.error.gameId },
          });
        } else if (result.error.status === "unauthorized") {
          res.status(403).json({
            success: false,
            error: "You are not authorized to view this player's context",
            details: { code: "not-authorized" },
          });
        } else if (result.error.status === "player-not-found") {
          res.status(404).json({
            success: false,
            error: "Player not found",
            details: { code: "player-not-found", playerId: result.error.playerId },
          });
        } else {
          res.status(500).json({ success: false, error: "An unexpected error occurred" });
        }
      }
    } catch (error) {
      next(error);
    }
  };
