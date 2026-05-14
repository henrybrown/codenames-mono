/**
 * Start Turn Service
 *
 * Creates a new turn for the next team after the previous turn has ended.
 *
 * Owns the full workflow: load the aggregate, validate the round, resolve
 * the acting player (with single-device fallback), validate via the rules
 * schema, derive the next team, run the gameplay handler, emit the event.
 *
 * Rule checks live in `start-turn.rules.ts`. The service translates a
 * validation failure into `{ success: false }`.
 */

import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import type { PlayerRole } from "@codenames/shared/types";
import { GAME_TYPE, PLAYER_ROLE } from "@codenames/shared/types";
import {
  resolveActingPlayerByPublicId,
  resolveActingPlayerForUser,
} from "@backend/game/access";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getOtherTeamId } from "@backend/game/state/helpers";
import { validateStartTurn } from "./start-turn.rules";

export type StartTurnInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
  playerId?: string;
};

export type StartTurnResult =
  | { success: true; data: { turn: { id: string; teamName: string; status: string } } }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
    };

export type StartTurnService = (input: StartTurnInput) => Promise<StartTurnResult>;

export type StartTurnDependencies = {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
};

/**
 * Start-turn's player resolution differs from the in-turn services
 * (clue/guess/end-turn) because no turn is active yet — there's no role
 * to resolve in single-device. Policy:
 *   - Multi-device: resolve by user from JWT.
 *   - Single-device + explicit playerId: resolve by publicId.
 *   - Single-device + no playerId: first team's first player.
 * The actor is used only for attribution, not for game-rule decisions.
 */
const resolvePlayer = (
  aggregate: GameAggregate,
  input: StartTurnInput,
): GamePlayer | null => {
  if (aggregate.game_type === GAME_TYPE.SINGLE_DEVICE) {
    if (input.playerId) {
      return resolveActingPlayerByPublicId(aggregate, input.playerId);
    }
    const first = aggregate.teams[0]?.players?.[0];
    if (!first) return null;
    return {
      _id: first._id,
      publicId: first.publicId,
      _userId: first._userId,
      _teamId: first._teamId,
      publicName: first.publicName,
      teamName: first.teamName,
      role: first.role as PlayerRole,
    };
  }
  return resolveActingPlayerForUser(aggregate, input.userId);
};

export const createStartTurnService =
  (logger: AppLogger) =>
  (deps: StartTurnDependencies): StartTurnService =>
  async (input) => {
    const log = logger.for({}).withMeta({ gameId: input.gameId }).create();
    log.info(`startTurn called`);

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
      return {
        success: false,
        message: "No player available to start the turn",
        notFound: true,
      };
    }

    const validation = validateStartTurn(aggregate);
    if (!validation.valid) {
      const message = validation.errors.map((e) => e.message).join(", ");
      log.warn(`startTurn failed: ${message}`);
      return { success: false, message };
    }

    // Validation guarantees a current round with ≥1 completed turn and no active turn.
    const currentRound = aggregate.currentRound!;
    const lastTurn = currentRound.turns[currentRound.turns.length - 1];

    const lastTeamId = aggregate.teams.find((t) => t.teamName === lastTurn.teamName)?._id;
    if (lastTeamId === undefined) {
      log.warn("startTurn failed: could not determine last team id");
      return { success: false, message: "Could not determine last team" };
    }

    const nextTeamId = getOtherTeamId(aggregate, lastTeamId);
    const nextTeam = aggregate.teams.find((t) => t._id === nextTeamId)!;

    const handlerResult = await deps.gameplayHandler(
      aggregate,
      playerContext,
      async (ops) => {
        const r = await ops.startTurn(currentRound._id, nextTeam._id);
        if (!r.ok) return r;
        return { ok: true as const, newTurn: r.newTurn };
      },
    );

    if (!handlerResult.ok) {
      log.warn(`startTurn failed: ${handlerResult.message}`);
      return { success: false, message: handlerResult.message };
    }

    const newTurnPublicId = handlerResult.newTurn.publicId;

    const nextCodemaster = currentRound.players.find(
      (p) => p._teamId === nextTeam._id && p.role === PLAYER_ROLE.CODEMASTER,
    );

    GameEventsEmitter.turnStarted(
      aggregate.public_id,
      currentRound.number,
      newTurnPublicId,
      nextCodemaster?.publicId,
    );

    log.info(`startTurn success: new turn for team ${nextTeam.teamName}`);
    return {
      success: true,
      data: {
        turn: {
          id: newTurnPublicId,
          teamName: nextTeam.teamName,
          status: "ACTIVE",
        },
      },
    };
  };
