/**
 * Start Turn Service
 * Creates a new turn for the next team after previous turn has ended
 */

import type { GameplayHandler } from "../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { PLAYER_ROLE } from "@codenames/shared/types";
import { GameplayValidationError } from "../errors/gameplay.errors";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getOtherTeamId } from "@backend/game/state/helpers";

export type StartTurnInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
};

export type StartTurnResult =
  | { success: true; data: { turn: { id: string; teamName: string; status: string } } }
  | { success: false; message: string };

export type StartTurnService = (input: StartTurnInput) => Promise<StartTurnResult>;

export type StartTurnDependencies = {
  gameplayHandler: GameplayHandler;
};

export const createStartTurnService =
  (logger: AppLogger) =>
  (deps: StartTurnDependencies): StartTurnService =>
  async (input) => {
    const { gameState, playerContext } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`startTurn called`);

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

    try {
      let newTurnPublicId = "";
      await deps.gameplayHandler(gameState, playerContext, async (ops) => {
        const { newTurn } = await ops.startTurn(currentRound._id, nextTeam._id);
        newTurnPublicId = newTurn.publicId;
      });

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
    } catch (error) {
      if (error instanceof GameplayValidationError) {
        log.warn(`startTurn failed: ${error.message}`);
        return { success: false, message: error.message };
      }
      log.error("startTurn failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, message: "Failed to start turn" };
    }
  };
