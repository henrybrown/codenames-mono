import { RoundCreator } from "@backend/shared/data-access/repositories/rounds.repository";
import { NewRoundValidLobbyState } from "./new-round.rules";

/**
 * Builds the new-round action.
 *
 * Computes the next round number from `historicalRounds.length + 1` and
 * inserts a new round row with that sequence.
 */
export const createNextRound = (createRoundRepo: RoundCreator) => {
  const createNewRound = async (gameState: NewRoundValidLobbyState) => {
    const nextRoundNumber = (gameState.historicalRounds?.length || 0) + 1;
    return await createRoundRepo({
      gameId: gameState._id,
      roundNumber: nextRoundNumber,
    });
  };

  return createNewRound;
};
