import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { getGameStateService } from "./get-game.service";
import { pickStatus } from "@backend/shared/http/result-status";
import { PLAYER_ROLE } from "@codenames/shared/types";
import { z } from "zod";

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

      if (!result.success) {
        res.status(pickStatus(result)).json({ success: false, error: result.message });
        return;
      }
      res.status(200).json({ success: true, data: { game: result.data } });
    } catch (error) {
      next(error);
    }
  };
