/**
 * Start Turn Controller
 * API endpoint to manually start the next turn.
 *
 * Called between turns (no active turn exists yet). Resolves the
 * acting player context the same way the other turn controllers do
 * so the gameplay handler has an ActingPlayer to thread through.
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { StartTurnService } from "./start-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import {
  findPlayerByUserId,
  findPlayerByPublicId,
  type GamePlayer,
} from "@backend/game/access";
import { GAME_TYPE, type PlayerRole } from "@codenames/shared/types";
import { z } from "zod";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

/**
 * Single-device: no active turn means we can't resolve a player by
 * role. The caller passes the public id of whichever player should
 * be marked as the actor (typically the codebreaker whose countdown
 * fired). Field is optional — single-device games without a body
 * just fall back to the first team's first player.
 */
const singleDeviceBody = z.object({
  playerId: z.string().min(1).optional(),
});

const multiDeviceBody = z.object({
  playerId: z.string().min(1),
});

export type StartTurnControllerDeps = {
  startTurn: StartTurnService;
  loadGameAggregate: GameAggregateLoader;
};

export const createStartTurnController =
  (logger: AppLogger) => (deps: StartTurnControllerDeps) => {
    return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const log = logger.for({}).withMeta({ endpoint: "POST /turns" }).create();

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
          const bodyResult = singleDeviceBody.safeParse(req.body ?? {});
          if (!bodyResult.success) {
            res.status(400).json({ success: false, error: "Invalid request body" });
            return;
          }
          if (bodyResult.data.playerId) {
            playerContext = findPlayerByPublicId(aggregate, bodyResult.data.playerId);
          } else {
            /** Fallback: any player on the first team. Start-turn doesn't read
             *  the actor for game-rule decisions (it just needs an ActingPlayer
             *  to satisfy the handler signature), so picking the first member
             *  of the first team is safe in single-device. */
            const firstTeam = aggregate.teams[0];
            playerContext = firstTeam?.players?.[0]
              ? {
                  _id: firstTeam.players[0]._id,
                  publicId: firstTeam.players[0].publicId,
                  _userId: firstTeam.players[0]._userId,
                  _teamId: firstTeam.players[0]._teamId,
                  publicName: firstTeam.players[0].publicName,
                  teamName: firstTeam.players[0].teamName,
                  role: firstTeam.players[0].role as PlayerRole,
                }
              : null;
          }
          if (!playerContext) {
            res.status(404).json({ success: false, error: "No player available to start the turn" });
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

        const result = await deps.startTurn({ gameState: aggregate, playerContext });

        if (!result.success) {
          log.warn(`Response: ${result.error}`);
          res.status(400).json(result);
          return;
        }

        log.info("Response: 201 Created");
        res.status(201).json(result);
      } catch (error) {
        logger.error("Error in startTurn controller", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: "Internal server error" });
      }
    };
  };
