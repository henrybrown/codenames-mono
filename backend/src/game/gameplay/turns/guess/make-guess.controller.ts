import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { MakeGuessService } from "./make-guess.service";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
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
  cardWord: z.string().min(1).max(50),
});

const multiDeviceBody = z.object({
  playerId: z.string().min(1),
  cardWord: z.string().min(1).max(50),
});

export type Dependencies = {
  makeGuess: MakeGuessService;
  loadGameAggregate: GameAggregateLoader;
};

export const makeGuessController = (logger: AppLogger) => (deps: Dependencies) => {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const log = logger.for({}).withMeta({ endpoint: "POST /guesses" }).create();

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
        res.status(409).json({ success: false, error: "Round is not current" });
        return;
      }

      let playerContext: GamePlayer | null;
      let cardWord: string;

      if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
        const bodyResult = singleDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        cardWord = bodyResult.data.cardWord;
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
        cardWord = bodyResult.data.cardWord;
        playerContext = findPlayerByUserId(aggregate, userId);
        if (!playerContext) {
          res.status(403).json({ success: false, error: "Not a player in this game" });
          return;
        }
      }

      const result = await deps.makeGuess({
        gameState: aggregate,
        playerContext,
        cardWord,
      });

      if (!result.success) {
        log.warn(`Response: ${result.error.status}`);
        switch (result.error.status) {
          case "round-not-found":
            res.status(404).json({ success: false, error: "Round not found" });
            return;
          case "round-not-current":
            res.status(409).json({ success: false, error: "Round is not current" });
            return;
          case "invalid-game-state":
            res.status(409).json({ success: false, error: "Invalid game state for making guess" });
            return;
          case "invalid-card":
            res.status(400).json({ success: false, error: "Invalid card selection" });
            return;
          default:
            res.status(500).json({ success: false, error: "Unknown error" });
            return;
        }
      }

      log.info(`Response: 200 OK, outcome=${result.data.guess.outcome}`);
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      logger.error("Error in makeGuess controller", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
};
