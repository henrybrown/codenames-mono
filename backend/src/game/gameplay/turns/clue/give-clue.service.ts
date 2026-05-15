import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
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
import {
  buildCompleteTurnData,
  type CompleteTurnData,
} from "../shared/present-turn";

export type GiveClueInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
  word: string;
  targetCardCount: number;
  role?: PlayerRole;
  playerId?: string;
};

export type GiveClueSuccess = {
  clue: { word: string; targetCardCount: number; createdAt: Date };
  turn: CompleteTurnData;
};

export type GiveClueResult =
  | { success: true; data: GiveClueSuccess }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
    };

export type GiveClueService = (input: GiveClueInput) => Promise<GiveClueResult>;

export type GiveClueDependencies = {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
  loadTurn: TurnLoader;
};

const resolvePlayer = (
  aggregate: GameAggregate,
  input: GiveClueInput,
): GamePlayer | null => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    if (!input.role) return null;
    return resolveActingPlayerForRole(aggregate, input.role);
  }
  return resolveActingPlayerForUser(aggregate, input.userId);
};

export const giveClueService =
  (logger: AppLogger) =>
  (deps: GiveClueDependencies): GiveClueService =>
  async (input) => {
    const log = logger.for({}).withMeta({ gameId: input.gameId }).create();
    log.info(`giveClue called: word=${input.word}, count=${input.targetCardCount}`);

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

    const handlerResult = await deps.gameplayHandler(
      aggregate,
      playerContext,
      async (ops) => {
        const r = await ops.giveClue(input.word, input.targetCardCount);
        if (!r.ok) return r;
        return {
          ok: true as const,
          clue: r.clue,
          turn: r.turn,
          state: await ops.state(),
        };
      },
    );

    if (!handlerResult.ok) {
      log.warn(`giveClue failed: ${handlerResult.message}`);
      return { success: false, message: handlerResult.message };
    }

    const activeTurn = getCurrentTurn(handlerResult.state);
    if (!activeTurn) {
      log.error("giveClue: no active turn after successful handler");
      return { success: false, message: "Internal state error" };
    }

    const turnData = await buildCompleteTurnData(
      deps.loadTurn,
      activeTurn.publicId,
      handlerResult.state.currentRound?.players ?? [],
    );
    if (!turnData) {
      log.error("giveClue: failed to load turn data");
      return { success: false, message: "Failed to load turn data" };
    }

    GameEventsEmitter.clueGiven(
      handlerResult.state.public_id,
      handlerResult.state.currentRound!.number,
      activeTurn.publicId,
      playerContext.publicId,
    );

    log.info(`giveClue success: word=${input.word}, count=${input.targetCardCount}`);
    return {
      success: true,
      data: {
        clue: {
          word: handlerResult.clue.word,
          targetCardCount: handlerResult.clue.number,
          createdAt: handlerResult.clue.createdAt,
        },
        turn: turnData,
      },
    };
  };

export type GiveClueServiceReturn = ReturnType<ReturnType<typeof giveClueService>>;
