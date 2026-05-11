import { UnexpectedLobbyError } from "../errors/lobby.errors";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { LobbyStateProvider } from "../state";
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

/** Service response including game context */
export type RemovePlayersServiceResult = {
  removedPlayer: PlayerResult;
};

/** Required dependencies for creating the RemovePlayersService */
export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  getLobbyState: LobbyStateProvider;
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
  ): Promise<RemovePlayersServiceResult> => {
    const lobby = await dependencies.getLobbyState(publicGameId, userId);
    if (!lobby) {
      throw new UnexpectedLobbyError(
        `Game with public ID ${publicGameId} not found`,
      );
    }

    if (lobby.status !== "LOBBY") {
      throw new UnexpectedLobbyError(
        `Cannot remove players from game in '${lobby.status}' state`,
      );
    }

    const playerToRemove = getPlayerByPublicId(
      lobby,
      playerIdToRemove,
    );
    if (!playerToRemove) {
      throw new UnexpectedLobbyError(
        `Player ${playerIdToRemove} not found in this game`,
      );
    }

    if (!isPlayerOwner(lobby, playerIdToRemove)) {
      throw new UnexpectedLobbyError(
        "You do not have permission to remove this player",
      );
    }

    return await dependencies.lobbyHandler(async (lobbyOps) => {
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
  };

  return removePlayers;
};
