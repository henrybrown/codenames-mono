/**
 * Start Turn Controller
 * API endpoint to manually start the next turn.
 *
 * Called between turns (no active turn exists yet). Multi-device games
 * always have an authenticated user → resolved to a player record.
 * Single-device games may pass `playerId` in the body, or the body may
 * be empty; in the empty case the service falls back to the first
 * team's first player (start-turn doesn't read the actor for game-rule
 * decisions, so any member is fine for attribution).
 *
 * Doesn't use `withTurnContext` because that helper requires a resolved
 * player; here the single-device fallback legally returns no player and
 * we let the service handle it.
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { StartTurnService } from "./start-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import {
  resolveActingPlayerByPublicId,
  resolveActingPlayerForUser,
  type GamePlayer,
} from "@backend/game/access";
import { GAME_TYPE } from "@codenames/shared/types";
import { z } from "zod";
import {
  endpointLogger,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";
import {
  startTurnSingleDeviceBody,
  startTurnMultiDeviceBody,
} from "./start-turn.validation";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

export type StartTurnControllerDeps = {
  startTurn: StartTurnService;
  loadGameAggregate: GameAggregateLoader;
};

export const createStartTurnController =
  (logger: AppLogger) => (deps: StartTurnControllerDeps) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const log = endpointLogger(logger, "POST /turns");
      try {
        const paramsResult = paramsSchema.safeParse(req.params);
        const authResult = authSchema.safeParse(req.auth);
        if (!paramsResult.success || !authResult.success) {
          sendError(res, 400, "Invalid request parameters");
          return;
        }
        const { gameId, roundNumber } = paramsResult.data;
        const { userId } = authResult.data;

        const aggregate = await deps.loadGameAggregate(gameId);
        if (!aggregate) {
          sendError(res, 404, "Game not found");
          return;
        }

        if (aggregate.currentRound && aggregate.currentRound.number !== roundNumber) {
          sendError(res, 409, "Round number mismatch");
          return;
        }

        let playerContext: GamePlayer | undefined;
        if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
          const bodyResult = startTurnSingleDeviceBody.safeParse(req.body ?? {});
          if (!bodyResult.success) {
            sendError(res, 400, "Invalid request body");
            return;
          }
          if (bodyResult.data.playerId) {
            const found = resolveActingPlayerByPublicId(aggregate, bodyResult.data.playerId);
            if (!found) {
              sendError(res, 404, "No player available to start the turn");
              return;
            }
            playerContext = found;
          }
          // No body / no playerId: service falls back to first team's first player.
        } else {
          const bodyResult = startTurnMultiDeviceBody.safeParse(req.body);
          if (!bodyResult.success) {
            sendError(res, 400, "playerId is required");
            return;
          }
          const found = resolveActingPlayerForUser(aggregate, userId);
          if (!found) {
            sendError(res, 403, "Not a player in this game");
            return;
          }
          playerContext = found;
        }

        const result = await deps.startTurn({ gameState: aggregate, playerContext });

        if (!result.success) {
          log.warn(`Response: ${result.message}`);
          sendError(res, 400, result.message);
          return;
        }

        log.info("Response: 201 Created");
        sendSuccess(res, 201, result.data);
      } catch (error) {
        next(error);
      }
    };
  };
