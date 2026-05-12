import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { LobbyAggregateLoader } from "../state";
import { getPlayerByPublicId, isPlayerOwner } from "../state/helpers";

/** Represents the result of a player removal operation */
export type PlayerResult = {
  _id: number;
  publicId: string;
  playerName: string;
  username?: string;
  teamName: string;
  statusId: number;
};

export type RemovePlayersSuccess = {
  removedPlayer: PlayerResult;
};

export type RemovePlayersResult =
  | { success: true; data: RemovePlayersSuccess }
  | { success: false; message: string; notFound?: boolean };

/** Required dependencies for creating the RemovePlayersService */
export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  loadLobbyAggregate: LobbyAggregateLoader;
};

/** Creates an implementation of the remove players service */
export const removePlayersService = (dependencies: ServiceDependencies) => {
  /**
   * Removes a specific player from a game
   * @param publicGameId - Public identifier of the game
   * @param userId - ID of the user attempting to remove the player
   * @param playerIdToRemove - Public UUID of the player to remove
   * @returns Removed player details and game context
   */
  const removePlayers = async (
    publicGameId: string,
    userId: number,
    playerIdToRemove: string,
  ): Promise<RemovePlayersResult> => {
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
        message: `Cannot remove players from game in '${lobby.status}' state`,
      };
    }

    const playerToRemove = getPlayerByPublicId(lobby, playerIdToRemove);
    if (!playerToRemove) {
      return {
        success: false,
        message: `Player ${playerIdToRemove} not found in this game`,
      };
    }

    if (!isPlayerOwner(lobby, playerIdToRemove)) {
      return {
        success: false,
        message: "You do not have permission to remove this player",
      };
    }

    const result = await dependencies.lobbyHandler(async (lobbyOps) => {
      const removedPlayer = await lobbyOps.removePlayer(playerToRemove._id);

      return {
        removedPlayer: {
          _id: removedPlayer._id,
          publicId: removedPlayer.publicId,
          playerName: removedPlayer.publicName,
          username: undefined, // Could be enriched with user data if needed
          teamName: removedPlayer.teamName,
          statusId: removedPlayer.statusId,
        },
      };
    });

    return { success: true, data: result };
  };

  return removePlayers;
};
