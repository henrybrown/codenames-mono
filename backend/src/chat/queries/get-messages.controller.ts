import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { getMessagesService } from "./get-messages.service";
import { z } from "zod";

/**
 * Request validation schemas
 */
const getMessagesParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

const getMessagesQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/**
 * Dependencies required by the controller
 */
export interface GetMessagesControllerDeps {
  getMessages: ReturnType<typeof getMessagesService>;
}

/**
 * Creates the get messages controller
 */
export const getMessagesController =
  (deps: GetMessagesControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = getMessagesParamsSchema.parse(req.params);
      const query = getMessagesQuerySchema.parse(req.query);
      const userId = req.auth?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const result = await deps.getMessages(gameId, userId, query);

      if (result.status === "game-not-found") {
        res.status(404).json({
          success: false,
          error: "Game not found or you are not a player in this game",
        });
        return;
      }

      if (result.status === "unauthorized") {
        res.status(403).json({
          success: false,
          error: "You do not have access to this game",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          messages: result.messages,
        },
      });
    } catch (error) {
      next(error);
    }
  };
