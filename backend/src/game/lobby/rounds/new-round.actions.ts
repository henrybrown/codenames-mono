import { RoundCreator } from "@backend/shared/data-access/repositories/rounds.repository";
import { NewRoundValidLobbyState } from "./new-round.rules";

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
