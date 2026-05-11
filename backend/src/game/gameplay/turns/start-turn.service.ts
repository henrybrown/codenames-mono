/**
 * Start Turn Service
 * Creates a new turn for the next team after previous turn has ended
 */

import type { GameplayHandler } from "../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import { PLAYER_ROLE } from "@codenames/shared/types";
import { GameplayValidationError } from "../errors/gameplay.errors";
import { GameEventsEmitter } from "@backend/shared/websocket";
import type { GameAggregate } from "@backend/game/state/gameplay-state.types";

export type StartTurnInput = {
  gameState: GameAggregate;
};

export type StartTurnService = (input: StartTurnInput) => Promise<StartTurnResult>;

export type StartTurnResult =
  | { success: true; data: { turn: { id: string; teamName: string; status: string } } }
  | { success: false; error: string };

export type StartTurnDependencies = {
  gameplayHandler: GameplayHandler;
};

export const createStartTurnService =
  (logger: AppLogger) =>
  (deps: StartTurnDependencies): StartTurnService => {
    const { gameplayHandler } = deps;

    return async (input) => {
      const { gameState } = input;
      const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
      log.info(`startTurn called`);

      try {
        const currentRound = gameState.currentRound;
        if (!currentRound) {
          log.warn("startTurn failed: no active round");
          return { success: false, error: "No active round" };
        }

        if (currentRound.status !== "IN_PROGRESS") {
          log.warn("startTurn failed: round not in progress");
          return { success: false, error: "Round not in progress" };
        }

        // Check if there's already an active turn
        const activeTurn = currentRound.turns.find((t) => t.status === "ACTIVE");
        if (activeTurn) {
          log.warn("startTurn failed: active turn already exists");
          return { success: false, error: "Active turn already exists" };
        }

        // Get the last completed turn to determine next team
        const lastTurn = currentRound.turns[currentRound.turns.length - 1];
        if (!lastTurn) {
          log.warn("startTurn failed: no previous turn found");
          return { success: false, error: "No previous turn found" };
        }

        if (lastTurn.status !== "COMPLETED") {
          log.warn("startTurn failed: previous turn not completed");
          return { success: false, error: "Previous turn not completed" };
        }

        // Find the other team (switch teams)
        const lastTeamId = gameState.teams.find((t) => t.teamName === lastTurn.teamName)?._id;
        const nextTeam = gameState.teams.find((t) => t._id !== lastTeamId);

        if (!nextTeam) {
          log.warn("startTurn failed: could not find next team");
          return { success: false, error: "Could not find next team" };
        }

        // Create the new turn
        let newTurnPublicId: string = "";
        await gameplayHandler(gameState, async (ops) => {
          const { newTurn } = await ops.startTurn(currentRound._id, nextTeam._id);
          newTurnPublicId = newTurn.publicId;
        });

        // Find the codemaster on the next team
        const nextCM = currentRound.players.find(
          (p) => p._teamId === nextTeam._id && p.role === PLAYER_ROLE.CODEMASTER,
        );

        // Emit WebSocket event
        GameEventsEmitter.turnStarted(gameState.public_id, currentRound.number, newTurnPublicId, nextCM?.publicId);

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
        log.error("Failed to start turn", { error: error instanceof Error ? error.message : String(error) });

        if (error instanceof GameplayValidationError) {
          return { success: false, error: error.message };
        }

        return { success: false, error: "Failed to start turn" };
      }
    };
  };
