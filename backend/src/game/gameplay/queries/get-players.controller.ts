import type { Response } from "express";
import type { Request } from "express-jwt";
import type { AppLogger } from "@backend/shared/logging";
import { GetPlayersService } from "./get-players.service";
import { z } from "zod";

/**
 * Schema for validating request parameters
 */
const getPlayersParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

/**
 * Dependencies required by the controller
 */
export type GetPlayersDependencies = {
  getPlayersService: GetPlayersService;
};

/**
 * Controller type definition
 */
export type GetPlayersController = (req: Request, res: Response) => Promise<void>;

/**
 * Creates the get players controller
 */
export const createGetPlayersController = (logger: AppLogger) => (
  deps: GetPlayersDependencies,
): GetPlayersController => {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { gameId } = getPlayersParamsSchema.parse(req.params);
      const userId = req.auth?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const result = await deps.getPlayersService(gameId, userId);

      if (result.status === "game-not-found") {
        res.status(404).json({
          success: false,
          error: "Game not found",
        });
        return;
      }

      if (result.status === "user-not-in-game") {
        res.status(403).json({
          success: false,
          error: "User is not a player in this game",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          players: result.data,
        },
      });
    } catch (error) {
      logger.error("Error in get players controller", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  };
};