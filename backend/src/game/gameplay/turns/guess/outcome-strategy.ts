import { CODEBREAKER_OUTCOME, type TurnOutcome } from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import {
  getCurrentTurn,
  getOtherTeamId,
} from "@backend/game/state/helpers";
import { checkRoundWinner, checkGameWinner } from "../../rounds";
import { UnexpectedGameplayError } from "../../errors/gameplay.errors";

/**
 * Tagged union describing what should happen after a guess.
 *
 * Pure data. The structure encodes cascade rules:
 *   - end-turn   → turn ends only
 *   - end-round  → turn + round end
 *   - end-game   → turn + round + game end
 */
export type OutcomeStrategy =
  | { strategy: "continue" }
  | { strategy: "end-turn"; turnId: number }
  | {
      strategy: "end-round";
      turnId: number;
      roundId: number;
      roundWinningTeamId: number;
    }
  | {
      strategy: "end-game";
      turnId: number;
      roundId: number;
      roundWinningTeamId: number;
      gameWinningTeamId: number;
    };

export type DetermineOutcomeInput = {
  outcome: TurnOutcome;
  postGuessState: GameAggregate;
};

/**
 * Pure derivation of what should happen after a guess.
 *
 * Reads the active turn from postGuessState — the turn that just had
 * a guess recorded on it. The active turn carries turnId, guessing
 * team, and remaining guesses; we don't need them passed separately.
 *
 * No IO, no async, no ops. Trivially unit-testable.
 */
export const determineOutcomeStrategy = (
  input: DetermineOutcomeInput,
): OutcomeStrategy => {
  const { outcome, postGuessState } = input;

  const currentRound = postGuessState.currentRound;
  if (!currentRound) {
    throw new UnexpectedGameplayError(
      "determineOutcomeStrategy: post-guess state has no current round",
    );
  }

  const currentTurn = getCurrentTurn(postGuessState);
  if (!currentTurn) {
    throw new UnexpectedGameplayError(
      "determineOutcomeStrategy: post-guess state has no active turn",
    );
  }

  const { _id: turnId, _teamId: guessingTeamId, guessesRemaining } = currentTurn;
  const otherTeamId = getOtherTeamId(postGuessState, guessingTeamId);

  switch (outcome) {
    case CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD: {
      const roundWinner = checkRoundWinner(
        currentRound.cards,
        guessingTeamId,
        otherTeamId,
      );
      if (roundWinner !== null) {
        return planRoundEnd(postGuessState, turnId, currentRound._id, roundWinner);
      }
      return guessesRemaining === 0
        ? { strategy: "end-turn", turnId }
        : { strategy: "continue" };
    }

    case CODEBREAKER_OUTCOME.OTHER_TEAM_CARD: {
      const roundWinner = checkRoundWinner(
        currentRound.cards,
        guessingTeamId,
        otherTeamId,
      );
      return roundWinner !== null
        ? planRoundEnd(postGuessState, turnId, currentRound._id, roundWinner)
        : { strategy: "end-turn", turnId };
    }

    case CODEBREAKER_OUTCOME.BYSTANDER_CARD:
      return { strategy: "end-turn", turnId };

    case CODEBREAKER_OUTCOME.ASSASSIN_CARD:
      return planRoundEnd(
        postGuessState,
        turnId,
        currentRound._id,
        otherTeamId,
      );
  }
};

/**
 * Given a round about to end, project forward to see if the game also ends.
 *
 * checkGameWinner reads historicalRounds; the just-won round isn't there
 * yet (still in currentRound), so we synthesise the eventual entry.
 *
 * @todo refactor checkGameWinner to take `roundWinners: number[]` directly —
 *       this synthesis goes away.
 */
const planRoundEnd = (
  postGuessState: GameAggregate,
  turnId: number,
  roundId: number,
  roundWinningTeamId: number,
): OutcomeStrategy => {
  const projectedHistorical = [
    ...postGuessState.historicalRounds,
    {
      _id: roundId,
      number: postGuessState.currentRound?.number ?? 0,
      status: "COMPLETED" as const,
      _winningTeamId: roundWinningTeamId,
      winningTeamName: "",
      createdAt: new Date(),
    },
  ];

  const gameWinner = checkGameWinner(
    projectedHistorical,
    postGuessState.game_format,
  );

  return gameWinner !== null
    ? {
        strategy: "end-game",
        turnId,
        roundId,
        roundWinningTeamId,
        gameWinningTeamId: gameWinner,
      }
    : { strategy: "end-round", turnId, roundId, roundWinningTeamId };
};
