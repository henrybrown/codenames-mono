import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { submitMessageService } from "./submit-message.service";
import { z } from "zod";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { MESSAGE_TYPE } from "@backend/shared/data-access/repositories/game-messages.repository";
import {
  requireUserId,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";

/**
 * Request validation schemas
 */
const submitMessageParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

const submitMessageBodySchema = z.object({
  content: z.string().min(1, "Message content is required").max(1000, "Message content cannot exceed 1000 characters"),
  teamOnly: z.boolean().default(false),
});

/**
 * Dependencies required by the controller
 */
export interface SubmitMessageControllerDeps {
  submitMessage: ReturnType<typeof submitMessageService>;
}

/**
 * Creates the submit message controller
 */
export const submitMessageController = (deps: SubmitMessageControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = submitMessageParamsSchema.parse(req.params);
      const body = submitMessageBodySchema.parse(req.body);
      const userId = requireUserId(req, res);
      if (userId === null) return;

      const result = await deps.submitMessage(gameId, userId, body);

      if (result.status === "invalid-input") {
        sendError(res, 400, result.error);
        return;
      }

      if (result.status === "game-not-found") {
        sendError(res, 404, "Game not found or you are not a player in this game");
        return;
      }

      if (result.status === "unauthorized") {
        sendError(res, 403, "You do not have access to this game");
        return;
      }

      GameEventsEmitter.gameMessageCreated(
        result.message.gameId,
        result.message.id,
        MESSAGE_TYPE.CHAT,
        result.audienceTeamId,
      );

      sendSuccess(res, 201, result.message);
    } catch (error) {
      next(error);
    }
  };
