import { UnexpectedLobbyError } from "../errors/lobby.errors";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { LobbyAggregateLoader } from "../state";
import { getTeamNameToIdMap, getAvailableTeamNames } from "../state/helpers";

export type PlayerResult = {
  _id: number;
  publicId: string;
  playerName: string;
  username?: string;
  teamName: string;
  statusId: number;
};

export type PlayerUpdateData = {
  playerId: string;
  playerName?: string;
  teamName?: string;
}[];

export type ModifyPlayersSuccess = {
  modifiedPlayers: PlayerResult[];
};

export type ModifyPlayersResult =
  | { success: true; data: ModifyPlayersSuccess }
  | { success: false; message: string; notFound?: boolean };

export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  loadLobbyAggregate: LobbyAggregateLoader;
};

export const modifyPlayersService = (dependencies: ServiceDependencies) => {
  const updatePlayers = async (
    publicGameId: string,
    playersToModify: PlayerUpdateData,
    userId: number,
  ): Promise<ModifyPlayersResult> => {
    if (!playersToModify.length) {
      return { success: true, data: { modifiedPlayers: [] } };
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
        message: `Cannot modify players in game state '${lobby.status}'`,
      };
    }

    // Multi-device authorization: users can only modify their own player
    if (lobby.gameType === "MULTI_DEVICE") {
      const allPlayers = lobby.teams.flatMap((t) => t.players);

      for (const playerUpdate of playersToModify) {
        const playerToModify = allPlayers.find(
          (p) => p.publicId === playerUpdate.playerId,
        );

        if (!playerToModify) {
          return {
            success: false,
            message: `Player ${playerUpdate.playerId} not found in game`,
          };
        }

        if (playerToModify._userId !== userId) {
          return {
            success: false,
            message: "In multi-device mode, you can only modify your own player",
          };
        }
      }
    }

    const teamNamesInRequest = playersToModify
      .map((p) => p.teamName)
      .filter((name): name is string => name !== undefined);

    const teamNameToIdMap = getTeamNameToIdMap(lobby);

    if (teamNamesInRequest.length > 0) {
      const uniqueTeamNames = [...new Set(teamNamesInRequest)];
      const missingTeams = uniqueTeamNames.filter(
        (name) => !teamNameToIdMap.has(name),
      );

      if (missingTeams.length > 0) {
        return {
          success: false,
          message: `Unknown team names: ${missingTeams.join(", ")}. Available teams: ${getAvailableTeamNames(lobby).join(", ")}`,
        };
      }
    }

    const result = await dependencies.lobbyHandler(async (lobbyOps) => {
      const repositoryRequest = playersToModify.map((player) => {
        const updateData: {
          gameId: number;
          publicPlayerId: string;
          publicName?: string;
          teamId?: number;
        } = {
          gameId: lobby._id,
          publicPlayerId: player.playerId,
        };

        if (player.playerName !== undefined) {
          updateData.publicName = player.playerName;
        }

        if (player.teamName !== undefined) {
          const teamId = teamNameToIdMap.get(player.teamName);
          if (teamId === undefined) {
            // Invariant: we just validated all team names exist above.
            throw new UnexpectedLobbyError(
              `Team '${player.teamName}' not found in game`,
            );
          }
          updateData.teamId = teamId;
        }

        return updateData;
      });

      const modifiedPlayers = await lobbyOps.modifyPlayers(repositoryRequest);

      if (modifiedPlayers.length !== playersToModify.length) {
        // Invariant: row-count mismatch from the repo. Internal failure.
        throw new UnexpectedLobbyError(
          `Failed to modify all players. Expected ${playersToModify.length}, modified ${modifiedPlayers.length}`,
        );
      }

      return {
        modifiedPlayers: modifiedPlayers.map((player) => ({
          _id: player._id,
          publicId: player.publicId,
          playerName: player.publicName,
          username: undefined,
          teamName: player.teamName,
          statusId: player.statusId,
        })),
      };
    });

    return { success: true, data: result };
  };

  return updatePlayers;
};
