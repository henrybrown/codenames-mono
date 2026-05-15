import type { LobbyOperations } from "../lobby-actions";
import type { LobbyAggregateLoader } from "../state";
import { getTotalPlayerCount, getTeamPlayerCounts } from "../state/helpers";
import { GAME_STATE } from "@codenames/shared/types";
import { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { createAIBotsForTeams } from "./start-game-ai-helper";
import type { UserCreator } from "@backend/shared/data-access/repositories/users.repository";
import { UnexpectedLobbyError } from "../errors/lobby.errors";

export type GameStartSuccess = {
  _id: number;
  success: true;
  publicId: string;
  status: string;
};

export type GameStartError = {
  success: false;
  message: string;
  notFound?: boolean;
  conflict?: boolean;
};

export type GameStartResult = GameStartSuccess | GameStartError;

export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  loadLobbyAggregate: LobbyAggregateLoader;
  createUser: UserCreator;
};

export const startGameService = (dependencies: ServiceDependencies) => {
  const startGame = async (publicGameId: string): Promise<GameStartResult> => {
    const lobby = await dependencies.loadLobbyAggregate(publicGameId, 0);
    if (!lobby) {
      return {
        success: false,
        notFound: true,
        message: `Game with public ID ${publicGameId} not found`,
      };
    }

    if (lobby.status !== "LOBBY") {
      return {
        success: false,
        conflict: true,
        message: `Cannot start game in '${lobby.status}' state`,
      };
    }

    if (!lobby.aiMode) {
      const totalPlayers = getTotalPlayerCount(lobby);
      const teamCounts = getTeamPlayerCounts(lobby);

      if (totalPlayers < 4) {
        return {
          success: false,
          conflict: true,
          message: "Cannot start game with less than 4 players",
        };
      }

      if (teamCounts.length < 2) {
        return {
          success: false,
          conflict: true,
          message: "Cannot start game with less than 2 teams",
        };
      }

      if (teamCounts.some((count) => count < 2)) {
        return {
          success: false,
          conflict: true,
          message: "Each team must have at least 2 players",
        };
      }
    }

    const result = await dependencies.lobbyHandler(async (lobbyOps) => {
      const updatedGame = await lobbyOps.updateGameStatus(lobby._id, GAME_STATE.IN_PROGRESS);

      if (updatedGame.status !== GAME_STATE.IN_PROGRESS) {
        throw new UnexpectedLobbyError(
          `Failed to start game. Expected status '${GAME_STATE.IN_PROGRESS}', got '${updatedGame.status}'`,
        );
      }

      return {
        success: true as const,
        _id: updatedGame._id,
        publicId: updatedGame.public_id,
        status: updatedGame.status,
      };
    });

    if (result.success && lobby.aiMode) {
      await createAIBotsForTeams({
        lobby,
        lobbyHandler: dependencies.lobbyHandler,
        createUser: dependencies.createUser,
      });
    }

    if (result.success) {
      GameEventsEmitter.gameStarted(publicGameId);
    }

    return result;
  };

  return startGame;
};
