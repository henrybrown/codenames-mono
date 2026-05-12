/**
 * End Turn Controller
 * API endpoint for codebreakers to end their turn.
 */

import type { EndTurnService } from "./end-turn.service";
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
} from "./shared/with-turn-context";
import {
  endTurnSingleDeviceBody,
  endTurnMultiDeviceBody,
} from "./end-turn.validation";

export type EndTurnControllerDeps = {
  endTurn: EndTurnService;
  loadGameAggregate: GameAggregateLoader;
};

type EndTurnPayload = Record<string, never>;

const resolveEndTurnPlayer: ResolvePlayer<EndTurnPayload> = (req, aggregate, userId) => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    const bodyResult = endTurnSingleDeviceBody.safeParse(req.body);
    if (!bodyResult.success) {
      return { ok: false, status: 400, error: "Invalid request body" };
    }
    const player = resolveActingPlayerForRole(aggregate, bodyResult.data.role);
    if (!player) {
      return { ok: false, status: 404, error: "No player for that role on the active turn" };
    }
    return { ok: true, player, body: {} };
  }

  const bodyResult = endTurnMultiDeviceBody.safeParse(req.body);
  if (!bodyResult.success) {
    return { ok: false, status: 400, error: "playerId is required" };
  }
  // Middleware already verified user is a member; this resolves the player record.
  const player = resolveActingPlayerForUser(aggregate, userId);
  if (!player) {
    // Defensive: middleware should have caught this.
    return { ok: false, status: 403, error: "Not a player in this game" };
  }
  return { ok: true, player, body: {} };
};

export const createEndTurnController = (logger: AppLogger) => (deps: EndTurnControllerDeps) =>
  withTurnContext({ logger, loadGameAggregate: deps.loadGameAggregate })<EndTurnPayload, unknown>(
    "POST /end-turn",
    resolveEndTurnPlayer,
    async (ctx) => {
      const result = await deps.endTurn({
        gameState: ctx.aggregate,
        playerContext: ctx.playerContext,
      });
      if (!result.success) {
        return { ok: false, status: 400, error: result.message };
      }
      return { ok: true, data: result.data };
    },
  );
