import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { LobbyAggregateLoader } from "../state";
import { getPlayerByPublicId, isPlayerOwner } from "../state/helpers";

/** Removed player projection returned by remove-players. */
export type PlayerResult = {
  _id: number;
  publicId: string;
  playerName: string;
  username?: string;
  teamName: string;
  statusId: number;
};

/** Successful remove-players payload. */
export type RemovePlayersSuccess = {
  removedPlayer: PlayerResult;
};

/** Tagged result for the remove-players service. */
export type RemovePlayersResult =
  | { success: true; data: RemovePlayersSuccess }
  | { success: false; message: string; notFound?: boolean };

/** Wiring dependencies for the remove-players service. */
export type ServiceDependencies = {
  lobbyHandler: TransactionalHandler<LobbyOperations>;
  loadLobbyAggregate: LobbyAggregateLoader;
};

/**
 * Builds the remove-players service.
 *
 * Validates that the game is still in lobby state, the target player
 * exists, and the requester owns the player (via `isPlayerOwner`). The
 * removal itself runs transactionally.
 */
export const removePlayersService = (dependencies: ServiceDependencies) => {
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
