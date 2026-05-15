import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import type { PlayerRole } from "@codenames/shared/types";
import { GAME_TYPE } from "@codenames/shared/types";
import {
  resolveActingPlayerForRole,
  resolveActingPlayerForUser,
} from "@backend/game/access";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getCurrentTurn } from "@backend/game/state/helpers";

export type EndTurnInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
  role?: PlayerRole;
  playerId?: string;
};

export type EndTurnResult =
  | {
      success: true;
      data: {
        turn: {
          id: string;
          teamName: string;
          status: string;
          completedAt: Date;
        };
      };
    }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
    };

export type EndTurnService = (input: EndTurnInput) => Promise<EndTurnResult>;

export type EndTurnDependencies = {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
};

const resolvePlayer = (
  aggregate: GameAggregate,
  input: EndTurnInput,
): GamePlayer | null => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    if (!input.role) return null;
    return resolveActingPlayerForRole(aggregate, input.role);
  }
  return resolveActingPlayerForUser(aggregate, input.userId);
};

export const createEndTurnService =
  (logger: AppLogger) =>
  (deps: EndTurnDependencies): EndTurnService =>
  async (input) => {
    const log = logger.for({}).withMeta({ gameId: input.gameId }).create();
    log.info(`endTurn called`);

    const aggregate = await deps.loadGameAggregate(input.gameId);
    if (!aggregate) {
      return { success: false, message: "Game not found", notFound: true };
    }

    if (!aggregate.currentRound) {
      return { success: false, message: "No current round" };
    }

    if (aggregate.currentRound.number !== input.roundNumber) {
      return { success: false, message: "Round is not current", conflict: true };
    }

    const playerContext = resolvePlayer(aggregate, input);
    if (!playerContext) {
      const message =
        aggregate.game_type === GAME_TYPE.SINGLE_DEVICE
          ? "No player for that role on the active turn"
          : "Not a player in this game";
      return { success: false, message, notFound: true };
    }

    const currentTurn = getCurrentTurn(aggregate);
    if (!currentTurn) {
      log.warn("endTurn failed: no active turn");
      return { success: false, message: "No active turn" };
    }

    const handlerResult = await deps.gameplayHandler(
      aggregate,
      playerContext,
      async (ops) => {
        const r = await ops.endTurn(currentTurn._id);
        if (!r.ok) return r;
        return { ok: true as const };
      },
    );

    if (!handlerResult.ok) {
      log.warn(`endTurn failed: ${handlerResult.message}`);
      return { success: false, message: handlerResult.message };
    }

    GameEventsEmitter.turnEnded(
      aggregate.public_id,
      aggregate.currentRound.number,
      currentTurn.publicId,
    );

    log.info(`endTurn success: turnId=${currentTurn.publicId}`);
    return {
      success: true,
      data: {
        turn: {
          id: currentTurn.publicId,
          teamName: currentTurn.teamName,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      },
    };
  };
