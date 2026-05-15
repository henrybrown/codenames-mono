import { RoundStatusUpdater } from "@backend/shared/data-access/repositories/rounds.repository";
import { TurnCreator } from "@backend/shared/data-access/repositories/turns.repository";
import { StartRoundValidLobbyState } from "./start-round.rules";
import { ROUND_STATE } from "@codenames/shared/types";

export const startCurrentRound = (
  updateRoundStatus: RoundStatusUpdater,
  createTurn: TurnCreator,
) => {
  const startRoundFromValidState = async (
    gameState: StartRoundValidLobbyState,
  ) => {
    const currentRound = gameState.currentRound!;

    const updatedRound = await updateRoundStatus({
      roundId: currentRound._id,
      status: ROUND_STATE.IN_PROGRESS,
    });

    // Determine starting team (simple logic: first team goes first)
    // You could make this more sophisticated later (e.g., random, alternating, etc.)
    const startingTeamId = gameState.teams[0]._id;

    await createTurn({
      roundId: currentRound._id,
      teamId: startingTeamId,
      guessesRemaining: 0,
    });

    return updatedRound;
  };

  return startRoundFromValidState;
};
