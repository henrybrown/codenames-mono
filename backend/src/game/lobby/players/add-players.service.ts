import { UnexpectedLobbyError } from "../errors/lobby.errors";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { LobbyAggregateLoader } from "../state";
import { getTeamNameToIdMap, getAvailableTeamNames } from "../state/helpers";
import { GameEventsEmitter } from "@backend/shared/websocket";

/** Created player projection returned by add-players. */
export type PlayerResult = {
  publicId: string;
  playerName: string;
  username?: string;
  teamName: string;
  statusId: number;
};

/** Request payload — array of {playerName, teamName} pairs. */
export type PlayerAddData = {
  playerName: string;
  teamName: string;
}[];

/** Successful add-players payload — the created records plus the game id. */
export type AddPlayersSuccess = {
  players: PlayerResult[];
  gamePublicId: string;
};

/** Tagged result for the add-players service. */
export type AddPlayersResult =
  | { success: true; data: AddPlayersSuccess }
  | { success: false; message: string; notFound?: boolean };

/** Wiring dependencies for the add-players service. */
export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  loadLobbyAggregate: LobbyAggregateLoader;
};

/**
 * Builds the add-players service.
 *
 * Validates the lobby state and team names, then persists the new players
 * transactionally and broadcasts a `playerJoined` event for each. Multi-
 * device games are restricted to one player per user and one player per
 * call.
 */
export const addPlayersService = (dependencies: ServiceDependencies) => {
  const addPlayers = async (
    publicGameId: string,
    userId: number,
    playersToAdd: PlayerAddData,
  ): Promise<AddPlayersResult> => {
    if (!playersToAdd.length) {
      return {
        success: true,
        data: { players: [], gamePublicId: publicGameId },
      };
    }

    const lobby = await dependencies.loadLobbyAggregate(publicGameId, userId);
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
        message: `Cannot add players to game in '${lobby.status}' state`,
      };
    }

    if (lobby.gameType === "MULTI_DEVICE" && playersToAdd.length > 1) {
      return {
        success: false,
        message: "Multi-device games only allow adding one player at a time",
      };
    }

    if (lobby.gameType === "MULTI_DEVICE") {
      const userAlreadyHasPlayer = lobby.teams.some((team) =>
        team.players.some((p) => p._userId === userId),
      );
      if (userAlreadyHasPlayer) {
        return {
          success: false,
          message:
            "You already have a player in this game. Multi-device games allow one player per user.",
        };
      }
    }

    const uniqueTeamNames = [...new Set(playersToAdd.map((p) => p.teamName))];
    const teamNameToIdMap = getTeamNameToIdMap(lobby);
    const missingTeams = uniqueTeamNames.filter(
      (name) => !teamNameToIdMap.has(name),
    );

    if (missingTeams.length > 0) {
      return {
        success: false,
        message: `Unknown team names: ${missingTeams.join(", ")}. Available teams: ${getAvailableTeamNames(lobby).join(", ")}`,
      };
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
        // Invariant: we asked for N players and got M back. Internal failure.
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

    result.players.forEach((player) => {
      const teamId = teamNameToIdMap.get(player.teamName);
      GameEventsEmitter.playerJoined(
        publicGameId,
        player.publicId,
        player.playerName,
        teamId,
      );
    });

    return { success: true, data: result };
  };

  return addPlayers;
};
