/**
 * Start Turn Service
 * Creates a new turn for the next team after previous turn has ended.
 *
 * `playerContext` is optional: in single-device games no turn is active,
 * so the controller can't always resolve a player by role. When omitted,
 * the service falls back to the first member of the first team. The
 * actor isn't used for game-rule decisions here — the gameplay handler
 * only needs an attribution target.
 */

import type { GameplayHandler } from "../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { PLAYER_ROLE, type PlayerRole } from "@codenames/shared/types";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getOtherTeamId } from "@backend/game/state/helpers";

export type StartTurnInput = {
  gameState: GameAggregate;
  playerContext?: GamePlayer;
};

export type StartTurnResult =
  | { success: true; data: { turn: { id: string; teamName: string; status: string } } }
  | { success: false; message: string };

export type StartTurnService = (input: StartTurnInput) => Promise<StartTurnResult>;

export type StartTurnDependencies = {
  gameplayHandler: GameplayHandler;
};

/**
 * Fallback actor for single-device games when the caller doesn't supply
 * a playerContext. Returns null if the game has no players (shouldn't
 * happen in practice — services only run after start-game succeeds).
 */
const firstTeamFirstPlayer = (gameState: GameAggregate): GamePlayer | null => {
  const first = gameState.teams[0]?.players?.[0];
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
};

export const createStartTurnService =
  (logger: AppLogger) =>
  (deps: StartTurnDependencies): StartTurnService =>
  async (input) => {
    const { gameState } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`startTurn called`);

    const playerContext = input.playerContext ?? firstTeamFirstPlayer(gameState);
    if (!playerContext) {
      log.warn("startTurn failed: no player available to attribute action");
      return { success: false, message: "No player available to start the turn" };
    }

    const currentRound = gameState.currentRound;
    if (!currentRound) {
      log.warn("startTurn failed: no active round");
      return { success: false, message: "No active round" };
    }

    if (currentRound.status !== "IN_PROGRESS") {
      log.warn("startTurn failed: round not in progress");
      return { success: false, message: "Round not in progress" };
    }

    const activeTurn = currentRound.turns.find((t) => t.status === "ACTIVE");
    if (activeTurn) {
      log.warn("startTurn failed: active turn already exists");
      return { success: false, message: "Active turn already exists" };
    }

    const lastTurn = currentRound.turns[currentRound.turns.length - 1];
    if (!lastTurn) {
      log.warn("startTurn failed: no previous turn found");
      return { success: false, message: "No previous turn found" };
    }

    if (lastTurn.status !== "COMPLETED") {
      log.warn("startTurn failed: previous turn not completed");
      return { success: false, message: "Previous turn not completed" };
    }

    const lastTeamId = gameState.teams.find((t) => t.teamName === lastTurn.teamName)?._id;
    if (lastTeamId === undefined) {
      log.warn("startTurn failed: could not determine last team id");
      return { success: false, message: "Could not determine last team" };
    }

    const nextTeamId = getOtherTeamId(gameState, lastTeamId);
    const nextTeam = gameState.teams.find((t) => t._id === nextTeamId);

    if (!nextTeam) {
      log.warn("startTurn failed: could not find next team");
      return { success: false, message: "Could not find next team" };
    }

    // ops.startTurn returns a Result; validation failures surface as
    // { ok: false, message } instead of throwing. Genuine internal
    // errors still throw and propagate to the global error middleware.
    const result = await deps.gameplayHandler(
      gameState,
      playerContext,
      async (ops) => ops.startTurn(currentRound._id, nextTeam._id),
    );

    if (!result.ok) {
      log.warn(`startTurn failed: ${result.message}`);
      return { success: false, message: result.message };
    }

    const newTurnPublicId = result.newTurn.publicId;

    const nextCodemaster = currentRound.players.find(
      (p) => p._teamId === nextTeam._id && p.role === PLAYER_ROLE.CODEMASTER,
    );

    GameEventsEmitter.turnStarted(
      gameState.public_id,
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
