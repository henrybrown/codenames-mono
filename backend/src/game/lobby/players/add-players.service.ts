import { UnexpectedLobbyError } from "../errors/lobby.errors";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { LobbyAggregateLoader } from "../state";
import { getTeamNameToIdMap, getAvailableTeamNames } from "../state/helpers";
import { GameEventsEmitter } from "@backend/shared/websocket";

export type PlayerResult = {
  publicId: string;
  playerName: string;
  username?: string;
  teamName: string;
  statusId: number;
};

export type PlayerAddData = {
  playerName: string;
  teamName: string;
}[];

export type AddPlayersServiceResult = {
  players: PlayerResult[];
  gamePublicId: string;
};

export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  loadLobbyAggregate: LobbyAggregateLoader;
};

export const addPlayersService = (dependencies: ServiceDependencies) => {
  const addPlayers = async (
    publicGameId: string,
    userId: number,
    playersToAdd: PlayerAddData,
  ): Promise<AddPlayersServiceResult> => {
    if (!playersToAdd.length) {
      return { players: [], gamePublicId: publicGameId };
    }

    const lobby = await dependencies.loadLobbyAggregate(publicGameId, userId);
    if (!lobby) {
      throw new UnexpectedLobbyError(
        `Game with public ID ${publicGameId} not found`,
      );
    }

    if (lobby.status !== "LOBBY") {
      throw new UnexpectedLobbyError(
        `Cannot add players to game in '${lobby.status}' state`,
      );
    }

    if (lobby.gameType === "MULTI_DEVICE" && playersToAdd.length > 1) {
      throw new UnexpectedLobbyError(
        "Multi-device games only allow adding one player at a time",
      );
    }

    // Multi-device: Prevent user from adding multiple players total
    if (lobby.gameType === "MULTI_DEVICE") {
      // Check if user already has a player in this game
      const userAlreadyHasPlayer = lobby.teams.some((team) =>
        team.players.some((p) => p._userId === userId),
      );

      if (userAlreadyHasPlayer) {
        throw new UnexpectedLobbyError(
          "You already have a player in this game. Multi-device games allow one player per user.",
        );
      }
    }

    const uniqueTeamNames = [...new Set(playersToAdd.map((p) => p.teamName))];
    const teamNameToIdMap = getTeamNameToIdMap(lobby);
    const missingTeams = uniqueTeamNames.filter(
      (name) => !teamNameToIdMap.has(name),
    );

    if (missingTeams.length > 0) {
      throw new UnexpectedLobbyError(
        `Unknown team names: ${missingTeams.join(", ")}. Available teams: ${getAvailableTeamNames(lobby).join(", ")}`,
      );
    }

    const result = await dependencies.lobbyHandler(async (lobbyOps) => {
      const repositoryRequest = playersToAdd.map((player) => ({
        userId,
        gameId: lobby._id,
        teamId: teamNameToIdMap.get(player.teamName)!,
        publicName: player.playerName,
        statusId: 1,
      }));

      const newPlayers = await lobbyOps.addPlayers(repositoryRequest);

      if (newPlayers.length !== playersToAdd.length) {
        throw new UnexpectedLobbyError(
          `Failed to add all players. Expected ${playersToAdd.length}, created ${newPlayers.length}`,
        );
      }

      return {
        players: newPlayers.map((player) => ({
          publicId: player.publicId,
          playerName: player.publicName,
          username: undefined,
          teamName: player.teamName,
          statusId: player.statusId,
        })),
        gamePublicId: lobby.public_id,
      };
    });

    // Emit WebSocket events for each added player
    result.players.forEach((player) => {
      const teamId = teamNameToIdMap.get(player.teamName);
      GameEventsEmitter.playerJoined(
        publicGameId,
        player.publicId,
        player.playerName,
        teamId,
      );
    });

    return result;
  };

  return addPlayers;
};
