import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { GiveClueService } from "./give-clue.service";
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

const clueFields = z.object({
  word: z.string().min(1).max(50),
  targetCardCount: z.number().int().min(1).max(25),
});

const singleDeviceBody = clueFields.extend({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
});

const multiDeviceBody = clueFields.extend({
  playerId: z.string().min(1),
});

export type Dependencies = {
  giveClue: GiveClueService;
  loadGameAggregate: GameAggregateLoader;
};

export const giveClueController = (logger: AppLogger) => (deps: Dependencies) => {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const log = logger.for({}).withMeta({ endpoint: "POST /clues" }).create();

    try {
      const paramsResult = paramsSchema.safeParse(req.params);
      const authResult = authSchema.safeParse(req.auth);
      if (!paramsResult.success || !authResult.success) {
        res.status(400).json({ success: false, error: "Invalid request parameters" });
        return;
      }
      const { gameId, roundNumber } = paramsResult.data;
      const { userId } = authResult.data;

      // Load aggregate (membership/role already verified by middleware)
      const aggregate = await deps.loadGameAggregate(gameId);
      if (!aggregate) {
        res.status(404).json({ success: false, error: "Game not found" });
        return;
      }

      if (aggregate.currentRound && aggregate.currentRound.number !== roundNumber) {
        res.status(409).json({ success: false, error: "Round is not current" });
        return;
      }

      // Resolve playerContext + body validation, branching on game type
      let playerContext: GamePlayer | null;
      let word: string;
      let targetCardCount: number;

      if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
        const bodyResult = singleDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        word = bodyResult.data.word;
        targetCardCount = bodyResult.data.targetCardCount;
        playerContext = findPlayerByActiveRole(aggregate, bodyResult.data.role);
        if (!playerContext) {
          res.status(404).json({ success: false, error: "No player for that role on the active turn" });
          return;
        }
      } else {
        const bodyResult = multiDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        word = bodyResult.data.word;
        targetCardCount = bodyResult.data.targetCardCount;
        // Middleware already verified user is the codemaster; this just retrieves
        playerContext = findPlayerByUserId(aggregate, userId);
        if (!playerContext) {
          // Defensive: middleware should have caught this
          res.status(403).json({ success: false, error: "Not a player in this game" });
          return;
        }
      }

      const result = await deps.giveClue({
        gameState: aggregate,
        playerContext,
        word,
        targetCardCount,
      });

      if (!result.success) {
        log.warn(`Response: 400, ${result.message}`);
        res.status(400).json({ success: false, error: result.message });
        return;
      }

      log.info(`Response: 200 OK, word=${result.data.clue.word}`);
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      logger.error("Error in giveClue controller", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
};
