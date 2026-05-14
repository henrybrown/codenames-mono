/**
 * Start Turn Controller — HTTP only.
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { z } from "zod";
import type { StartTurnService } from "./start-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import {
  endpointLogger,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";
import { pickStatus } from "@backend/shared/http/result-status";

const requestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1),
    roundNumber: z.string().transform(Number).refine((n) => n > 0),
  }),
  body: z.object({
    // playerId optional in both modes:
    //   - single-device: omit to fall back to first-team-first-player.
    //   - multi-device: identity comes from JWT; service resolves by user.
    //     Including it is allowed but ignored — frontend may pass it anyway.
    playerId: z.string().min(1).optional(),
  }),
  auth: z.object({
    userId: z.number().int().positive(),
  }),
});

export type StartTurnControllerDeps = {
  startTurn: StartTurnService;
};

export const createStartTurnController =
  (logger: AppLogger) =>
  (deps: StartTurnControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const log = endpointLogger(logger, "POST /turns");
    try {
      const parsed = requestSchema.safeParse({
        params: req.params,
        body: req.body ?? {},
        auth: req.auth,
      });
      if (!parsed.success) {
        sendError(res, 400, "Invalid request");
        return;
      }
      const { params, body, auth } = parsed.data;
      const result = await deps.startTurn({
        gameId: params.gameId,
        roundNumber: params.roundNumber,
        userId: auth.userId,
        playerId: body.playerId,
      });
      if (!result.success) {
        log.warn(`Response: ${result.message}`);
        sendError(res, pickStatus(result), result.message);
        return;
      }
      log.info("Response: 201");
      sendSuccess(res, 201, result.data);
    } catch (error) {
      next(error);
    }
  };
