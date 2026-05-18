import type { Response, NextFunction } from "express";
import type { Request as JWTRequest } from "express-jwt";
import { createGameService } from "./create-game.service";
import {
  createGameRequestSchema,
  createGameResponseSchema,
  CreateGameResponse,
} from "./create.game.validation";
import { requireUserId } from "@backend/shared/http-middleware/controller-helpers";

/** Wiring dependencies for the create-game controller. */
export type Dependencies = {
  createGame: ReturnType<typeof createGameService>;
};

/**
 * `POST /api/games` — creates a new game in LOBBY state.
 *
 * Authenticated user becomes the lobby admin. Responds 201 with the
 * created game's public id and metadata.
 */
export const createGameController =
  ({ createGame }: Dependencies) =>
  async (req: JWTRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
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

      const validatedResponse = createGameResponseSchema.parse(response);

      res.status(201).json(validatedResponse);
    } catch (error) {
      next(error);
    }
  };
