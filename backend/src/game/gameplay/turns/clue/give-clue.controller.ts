import type { GiveClueService } from "./give-clue.service";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import {
  resolveActingPlayerForRole,
  resolveActingPlayerForUser,
} from "@backend/game/access";
import { GAME_TYPE } from "@codenames/shared/types";
import {
  withTurnContext,
  type ResolvePlayer,
} from "../shared/with-turn-context";
import {
  giveClueSingleDeviceBody,
  giveClueMultiDeviceBody,
} from "./give-clue.validation";

export type Dependencies = {
  giveClue: GiveClueService;
  loadGameAggregate: GameAggregateLoader;
};

type CluePayload = { word: string; targetCardCount: number };

const resolveCluePlayer: ResolvePlayer<CluePayload> = (req, aggregate, userId) => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    const bodyResult = giveClueSingleDeviceBody.safeParse(req.body);
    if (!bodyResult.success) {
      return { ok: false, status: 400, error: "Invalid request body" };
    }
    const player = resolveActingPlayerForRole(aggregate, bodyResult.data.role);
    if (!player) {
      return { ok: false, status: 404, error: "No player for that role on the active turn" };
    }
    return {
      ok: true,
      player,
      body: { word: bodyResult.data.word, targetCardCount: bodyResult.data.targetCardCount },
    };
  }

  const bodyResult = giveClueMultiDeviceBody.safeParse(req.body);
  if (!bodyResult.success) {
    return { ok: false, status: 400, error: "Invalid request body" };
  }
  // Middleware already verified user is the codemaster; this just resolves the record.
  const player = resolveActingPlayerForUser(aggregate, userId);
  if (!player) {
    // Defensive: middleware should have caught this.
    return { ok: false, status: 403, error: "Not a player in this game" };
  }
  return {
    ok: true,
    player,
    body: { word: bodyResult.data.word, targetCardCount: bodyResult.data.targetCardCount },
  };
};

export const giveClueController = (logger: AppLogger) => (deps: Dependencies) =>
  withTurnContext({ logger, loadGameAggregate: deps.loadGameAggregate })<CluePayload, unknown>(
    "POST /clues",
    resolveCluePlayer,
    async (ctx, body) => {
      const result = await deps.giveClue({
        gameState: ctx.aggregate,
        playerContext: ctx.playerContext,
        word: body.word,
        targetCardCount: body.targetCardCount,
      });
      if (!result.success) {
        return { ok: false, status: 400, error: result.message };
      }
      return { ok: true, data: result.data };
    },
  );
