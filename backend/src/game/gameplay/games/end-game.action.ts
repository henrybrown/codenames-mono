import { GAME_STATE } from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import type { GameStatusUpdater } from "@backend/shared/data-access/repositories/games.repository";

/**
 * Builds the end-game action — sets the game's status to COMPLETED.
 *
 * Performs no rules check of its own; game-end is a cascade consequence
 * and the caller is expected to have already determined that the game is
 * won. The `_winningTeamId` parameter is accepted for symmetry with other
 * end-* actions but isn't persisted on the game row.
 */
export const createEndGameAction = (updateGameStatus: GameStatusUpdater) => {
  return async (gameState: GameAggregate, _winningTeamId: number) => {
    return await updateGameStatus(gameState._id, GAME_STATE.COMPLETED);
  };
};
/** Bound end-game action. */
export type EndGameAction = ReturnType<typeof createEndGameAction>;
