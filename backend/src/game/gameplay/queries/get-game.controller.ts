import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { getGameStateService } from "./get-game.service";
import { pickStatus } from "@backend/shared/http/result-status";
import { PLAYER_ROLE } from "@codenames/shared/types";
import { z } from "zod";

/**
 * Request schema for the get-game endpoint.
 *
 * `playerId` and `role` are mutually exclusive — providing both fails
 * validation. Neither is required; the response defaults to
 * "current user's player" when both are absent.
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

/** Parsed shape of a validated get-game request. */
export type ValidatedGameStateRequest = z.infer<typeof gameStateRequestSchema>;

/** Wiring dependencies for the get-game controller. */
export type Dependencies = {
  getGameState: ReturnType<ReturnType<typeof getGameStateService>>;
};

/**
 * `GET /api/games/:gameId` — returns the public game state, with cards
 * masked or unmasked based on the requesting player's role.
 *
 * Maps service failure flags (`notFound`, `conflict`) to HTTP status codes.
 */
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
