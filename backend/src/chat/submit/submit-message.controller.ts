import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { submitMessageService } from "./submit-message.service";
import { z } from "zod";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { MESSAGE_TYPE } from "@backend/shared/data-access/repositories/game-messages.repository";

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
      const userId = req.auth?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const result = await deps.submitMessage(gameId, userId, body);

      if (result.status === "invalid-input") {
        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

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

      GameEventsEmitter.gameMessageCreated(
        result.message.gameId,
        result.message.id,
        MESSAGE_TYPE.CHAT,
        result.audienceTeamId,
      );

      res.status(201).json({
        success: true,
        data: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
