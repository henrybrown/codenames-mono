import { GAME_STATE } from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import type { GameStatusUpdater } from "@backend/shared/data-access/repositories/games.repository";

/**
 * Ends the game by setting its status to COMPLETED.
 *
 * No rules check — game-end happens as a cascade consequence and the
 * caller is responsible for ensuring it's appropriate (via
 * `checkGameWinner` from rounds/winning-conditions).
 */
export const createEndGameAction = (updateGameStatus: GameStatusUpdater) => {
  return async (gameState: GameAggregate, _winningTeamId: number) => {
    return await updateGameStatus(gameState._id, GAME_STATE.COMPLETED);
  };
};
export type EndGameAction = ReturnType<typeof createEndGameAction>;
