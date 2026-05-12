import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";

import { startGameService } from "./start-game.service";
import {
  startGameRequestSchema,
  startGameResponseSchema,
} from "./start-game.validation";
import { pickStatus } from "@backend/shared/http/result-status";
import { sendError } from "@backend/shared/http-middleware/controller-helpers";

/** Dependencies required by the start game controller */
export type Dependencies = {
  startGame: ReturnType<typeof startGameService>;
};

/** Creates a controller for starting a game */
export const startGameController =
  ({ startGame }: Dependencies) =>
  /**
   * Handles HTTP request to start a game
   * @param req - Express request with game ID
   * @param res - Express response object
   * @param next - Express error handling function
   */
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedRequest = startGameRequestSchema.parse({
        params: req.params,
        auth: req.auth,
      });

      const gameId = validatedRequest.params.gameId;
      const result = await startGame(gameId);

      if (result.success) {
        const response = {
          success: true,
          data: {
            game: {
              publicId: result.publicId,
              status: result.status,
            },
          },
        };

        const validatedResponse = startGameResponseSchema.parse(response);
        res.status(200).json(validatedResponse);
      } else {
        sendError(res, pickStatus(result), result.message);
      }
    } catch (error) {
      next(error);
    }
  };
