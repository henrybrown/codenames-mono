import {
  GAME_STATE,
  ROUND_STATE,
  PLAYER_ROLE,
  CODEBREAKER_OUTCOME,
  GameFormat,
} from "@codenames/shared/types";
import {
  GameAggregate,
  Card,
  HistoricalRound,
  Turn,
} from "@backend/game/state/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  playerContextSchema,
  cardSchema,
  turnSchema,
  teamSchema,
} from "@backend/game/state/types";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { getCurrentTurn } from "@backend/game/state/helpers";
import { z } from "zod";

/**
 * Validation schemas for make-guess related actions
 */
const makeGuessActionSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
    cards: z.array(cardSchema).min(1, "Must have cards to guess"),
    turns: z.array(turnSchema).min(1, "Must have at least one turn"),
  }),
  playerContext: playerContextSchema.extend({
    role: z.literal(PLAYER_ROLE.CODEBREAKER),
  }), 
})
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn !== null;
  }, {
    message: "No active turn found",
    path: ["currentRound", "turns"],
  })
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn && currentTurn._teamId === data.playerContext._teamId;
  }, {
    message: "It's not your team's turn",
    path: ["playerContext", "teamId"],
  })
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn && currentTurn.status === "ACTIVE";
  }, {
    message: "Current turn is not active",
    path: ["currentRound", "turns"],
  })
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn && currentTurn.clue !== null && currentTurn.clue !== undefined;
  }, {
    message: "No clue has been given for this turn",
    path: ["currentRound", "turns"],
  })
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn && currentTurn.guessesRemaining > 0;
  }, {
    message: "No guesses remaining for this turn",
    path: ["currentRound", "turns"],
  });

const endTurnSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
    turns: z.array(turnSchema).min(1, "Must have turns to end"),
  }),
});

const startTurnSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
  }),
  teams: z.array(teamSchema).min(2, "Must have at least 2 teams"),
});

const endRoundSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
  }),
});

/**
 * Branded types for each action
 */
export type MakeGuessValidGameState = ValidatedGameState<
  typeof makeGuessActionSchema
>;
export type EndTurnValidGameState = ValidatedGameState<typeof endTurnSchema>;
export type StartTurnValidGameState = ValidatedGameState<
  typeof startTurnSchema
>;
export type EndRoundValidGameState = ValidatedGameState<typeof endRoundSchema>;

/**
 * Helper function to validate turn state for guessing
 */
export function validateTurnForGuessing(
  turn: Turn | null
): { valid: boolean; error?: string } {
  if (!turn) {
    return { valid: false, error: "No active turn" };
  }
  
  if (turn.status !== "ACTIVE") {
    return { valid: false, error: "Turn is not active" };
  }
  
  if (!turn.clue) {
    return { valid: false, error: "No clue given yet" };
  }
  
  if (turn.guessesRemaining <= 0) {
    return { valid: false, error: "No guesses remaining" };
  }
  
  return { valid: true };
}

/**
 * Validation functions
 */
export const validateMakeGuess = (
  data: GameAggregate,
): GameplayValidationResult<MakeGuessValidGameState> => {
  return validateWithZodSchema(makeGuessActionSchema, data);
};

export const validateEndTurn = (
  data: GameAggregate,
): GameplayValidationResult<EndTurnValidGameState> => {
  return validateWithZodSchema(endTurnSchema, data);
};

export const validateStartTurn = (
  data: GameAggregate,
): GameplayValidationResult<StartTurnValidGameState> => {
  return validateWithZodSchema(startTurnSchema, data);
};

export const validateEndRound = (
  data: GameAggregate,
): GameplayValidationResult<EndRoundValidGameState> => {
  return validateWithZodSchema(endRoundSchema, data);
};

/**
 * Pure domain functions for determining winning conditions
 */
export const winningConditions = {
  /**
   * Gets current score for each team based on completed rounds
   */
  getTeamScores(historicalRounds: HistoricalRound[]): Record<number, number> {
    const scores: Record<number, number> = {};

    historicalRounds
      .filter(
        (round) =>
          round.status === ROUND_STATE.COMPLETED && round._winningTeamId,
      )
      .forEach((round) => {
        const teamId = round._winningTeamId!;
        scores[teamId] = (scores[teamId] || 0) + 1;
      });

    return scores;
  },

  /**
   * Checks if any team has won the current round
   * Returns winning team ID or null if round continues
   */
  checkRoundWinner(
    cards: Card[],
    guessingTeamId: number,
    otherTeamId: number,
  ): number | null {
    // Check if assassin was hit - other team wins immediately
    const assassinCard = cards.find((card) => card.cardType === "ASSASSIN");
    if (assassinCard?.selected) {
      return otherTeamId;
    }

    // Check if guessing team has completed all their cards
    const guessingTeamUnselected = cards.filter(
      (card) =>
        card.cardType === "TEAM" &&
        card._teamId === guessingTeamId &&
        !card.selected,
    );
    if (guessingTeamUnselected.length === 0) {
      return guessingTeamId;
    }

    // Check if other team has completed all their cards
    const otherTeamUnselected = cards.filter(
      (card) =>
        card.cardType === "TEAM" &&
        card._teamId === otherTeamId &&
        !card.selected,
    );
    if (otherTeamUnselected.length === 0) {
      return otherTeamId;
    }

    return null; // Round continues
  },

  /**
   * Checks if any team has won the overall game
   */
  checkGameWinner(
    historicalRounds: HistoricalRound[],
    gameFormat: GameFormat,
  ): number | null {
    const teamScores = this.getTeamScores(historicalRounds);

    switch (gameFormat) {
      case "QUICK":
        return historicalRounds[0]?._winningTeamId || null;
      case "BEST_OF_THREE":
        const winningEntry = Object.entries(teamScores).find(
          ([_, wins]) => wins >= 2,
        );
        return winningEntry ? Number(winningEntry[0]) : null;
      case "ROUND_ROBIN":
        return null; // Not implemented yet
      default:
        return null;
    }
  },
};
