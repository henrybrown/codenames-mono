import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { getMessagesService } from "./get-messages.service";
import { z } from "zod";
import {
  requireUserId,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";

const getMessagesParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

const getMessagesQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export interface GetMessagesControllerDeps {
  getMessages: ReturnType<typeof getMessagesService>;
}

export const getMessagesController =
  (deps: GetMessagesControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = getMessagesParamsSchema.parse(req.params);
      const query = getMessagesQuerySchema.parse(req.query);
      const userId = requireUserId(req, res);
      if (userId === null) return;

      const result = await deps.getMessages(gameId, userId, query);

      if (result.status === "game-not-found") {
        sendError(res, 404, "Game not found or you are not a player in this game");
        return;
      }

      if (result.status === "unauthorized") {
        sendError(res, 403, "You do not have access to this game");
        return;
      }

      sendSuccess(res, 200, { messages: result.messages });
    } catch (error) {
      next(error);
    }
  };
