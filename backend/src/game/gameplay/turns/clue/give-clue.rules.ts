import { GAME_STATE, ROUND_STATE, PLAYER_ROLE } from "@codenames/shared/types";
import { GameAggregate } from "@backend/game/state/gameplay-state.types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  playerContextSchema,
} from "@backend/game/state/gameplay-state.types";
import { getCurrentTurn } from "@backend/game/state/gameplay-state.helpers";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/gameplay-state.validation";
import { z } from "zod";

/**
 * Rules for validating clue giving in the game
 */
const clueGivingRules = {
  /**
   * Checks if the player is a codemaster
   */
  isPlayerCodemaster(game: GameAggregate): boolean {
    return game.playerContext?.role === PLAYER_ROLE.CODEMASTER || false;
  },

  /**
   * Checks if it's the player's team's turn
   */
  isPlayersTurn(game: GameAggregate): boolean {
    const currentTurn = getCurrentTurn(game);
    return (
      currentTurn !== null && 
      game.playerContext !== null && 
      currentTurn._teamId === game.playerContext._teamId
    );
  },

  /**
   * Checks if the current turn has no clue yet
   */
  hasNoExistingClue(game: GameAggregate): boolean {
    const currentTurn = getCurrentTurn(game);
    return currentTurn !== null && !currentTurn.clue;
  },

  /**
   * Checks if the turn is active
   */
  isTurnActive(game: GameAggregate): boolean {
    const currentTurn = getCurrentTurn(game);
    return currentTurn !== null && currentTurn.status === "ACTIVE";
  },

  /**
   * Checks if the round is in progress
   */
  isRoundInProgress(game: GameAggregate): boolean {
    return (
      game.currentRound !== undefined &&
      game.currentRound !== null &&
      game.currentRound.status === ROUND_STATE.IN_PROGRESS
    );
  },
};

/**
 * Enhanced clue validation that checks against card words
 */
export const validateClueWord = (
  game: GameAggregate,
  clueWord: string,
): { valid: boolean; error?: string } => {
  if (!game.currentRound || !game.currentRound.cards) {
    return { valid: false, error: "No cards available to validate against" };
  }

  const normalizedClue = clueWord.toLowerCase().trim();

  const cardWords = game.currentRound.cards.map((card) =>
    card.word.toLowerCase(),
  );
  if (cardWords.includes(normalizedClue)) {
    return {
      valid: false,
      error: `Clue word "${clueWord}" matches a card word on the board`,
    };
  }

  if (game.currentRound.turns) {
    const previousClues = game.currentRound.turns
      .map((turn) => turn.clue?.word.toLowerCase())
      .filter(Boolean);

    if (previousClues.includes(normalizedClue)) {
      return {
        valid: false,
        error: `Clue word "${clueWord}" has already been used this round`,
      };
    }
  }

  return { valid: true };
};

/**
 * Schema for clue giving validation
 */
const clueGivingSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
  }),
  playerContext: playerContextSchema.extend({
    role: z.literal(PLAYER_ROLE.CODEMASTER),
  }),
});

/**
 * Enhanced schema with business rules
 */
const clueGivingAllowedSchema = clueGivingSchema
  .refine(clueGivingRules.isRoundInProgress, {
    message: "Round must be in progress to give clues",
    path: ["currentRound", "status"],
  })
  .refine(clueGivingRules.isPlayerCodemaster, {
    message: "Only codemasters can give clues",
    path: ["playerContext", "role"],
  })
  .refine(clueGivingRules.isPlayersTurn, {
    message: "It's not your team's turn",
    path: ["currentRound", "turns"],
  })
  .refine(clueGivingRules.hasNoExistingClue, {
    message: "A clue has already been given for this turn",
    path: ["currentRound", "turns"],
  })
  .refine(clueGivingRules.isTurnActive, {
    message: "The current turn is not active",
    path: ["currentRound", "turns"],
  });

/**
 * Type definition for a valid game state during clue giving
 */
export type GiveClueValidGameState = ValidatedGameState<
  typeof clueGivingAllowedSchema
>;

/**
 * Validates the game state for clue giving
 */
export function validate(
  data: GameAggregate,
): GameplayValidationResult<GiveClueValidGameState> {
  return validateWithZodSchema(clueGivingAllowedSchema, data);
}
