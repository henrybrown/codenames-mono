/**
 * End Turn Controller
 * API endpoint for codebreakers to end their turn
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { EndTurnService } from "./end-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import {
  findPlayerByUserId,
  findPlayerByActiveRole,
  type GamePlayer,
} from "@backend/game/access";
import { PLAYER_ROLE, GAME_TYPE } from "@codenames/shared/types";
import { z } from "zod";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

const singleDeviceBody = z.object({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
});

const multiDeviceBody = z.object({
  playerId: z.string().min(1),
});

export type EndTurnControllerDeps = {
  endTurn: EndTurnService;
  loadGameAggregate: GameAggregateLoader;
};

export const createEndTurnController = (logger: AppLogger) => (deps: EndTurnControllerDeps) => {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const log = logger.for({}).withMeta({ endpoint: "POST /end-turn" }).create();

    try {
      const paramsResult = paramsSchema.safeParse(req.params);
      const authResult = authSchema.safeParse(req.auth);
      if (!paramsResult.success || !authResult.success) {
        res.status(400).json({ success: false, error: "Invalid request parameters" });
        return;
      }
      const { gameId, roundNumber } = paramsResult.data;
      const { userId } = authResult.data;

      const aggregate = await deps.loadGameAggregate(gameId);
      if (!aggregate) {
        res.status(404).json({ success: false, error: "Game not found" });
        return;
      }

      if (aggregate.currentRound && aggregate.currentRound.number !== roundNumber) {
        res.status(409).json({ success: false, error: "Round number mismatch" });
        return;
      }

      let playerContext: GamePlayer | null;
      if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
        const bodyResult = singleDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        playerContext = findPlayerByActiveRole(aggregate, bodyResult.data.role);
        if (!playerContext) {
          res.status(404).json({ success: false, error: "No player for that role on the active turn" });
          return;
        }
      } else {
        const bodyResult = multiDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "playerId is required" });
          return;
        }
        playerContext = findPlayerByUserId(aggregate, userId);
        if (!playerContext) {
          res.status(403).json({ success: false, error: "Not a player in this game" });
          return;
        }
      }

      const result = await deps.endTurn({ gameState: aggregate, playerContext });

      if (!result.success) {
        log.warn(`Response: ${result.message}`);
        res.status(400).json({ success: false, error: result.message });
        return;
      }

      log.info("Response: 200 OK");
      res.status(200).json(result);
    } catch (error) {
      logger.error("Error in endTurn controller", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
};
