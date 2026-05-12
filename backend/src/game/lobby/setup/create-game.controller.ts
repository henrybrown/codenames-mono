import type { Response, NextFunction } from "express";
import type { Request as JWTRequest } from "express-jwt";
import { createGameService } from "./create-game.service";
import {
  createGameRequestSchema,
  createGameResponseSchema,
  CreateGameResponse,
} from "./create.game.validation";
import { requireUserId } from "@backend/shared/http-middleware/controller-helpers";

/** Dependencies required by the create game controller */
export type Dependencies = {
  createGame: ReturnType<typeof createGameService>;
};

/** Creates a controller for handling game creation requests */
export const createGameController =
  ({ createGame }: Dependencies) =>
  /**
   * Handles HTTP request to create a new game
   * @param req - Express request with game creation details and user auth
   * @param res - Express response object
   * @param next - Express error handling function
   */
  async (req: JWTRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Runtime validation of request object
      const parsedReq = createGameRequestSchema.parse(req.body);

      const userId = requireUserId(req, res);
      if (userId === null) return;

      const gameCreationResult = await createGame(
        parsedReq.gameType,
        parsedReq.gameFormat,
        userId, // Pass user ID to create admin player
        parsedReq.aiMode,
      );

      const response: CreateGameResponse = {
        success: true,
        data: {
          game: {
            publicId: gameCreationResult.publicId,
            gameFormat: parsedReq.gameFormat,
            gameType: parsedReq.gameType,
            createdAt: gameCreationResult.createdAt,
          },
        },
      };

      // Runtime validation of response object
      const validatedResponse = createGameResponseSchema.parse(response);

      res.status(201).json(validatedResponse);
    } catch (error) {
      next(error);
    }
  };
