import {
  GAME_STATE,
  ROUND_STATE,
} from "@codenames/shared/types";
import {
  GameAggregate,
  Turn,
} from "@backend/game/state/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  cardSchema,
  turnSchema,
} from "@backend/game/state/types";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { getCurrentTurn } from "@backend/game/state/helpers";
import { z } from "zod";

const makeGuessActionSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
    cards: z.array(cardSchema).min(1, "Must have cards to guess"),
    turns: z.array(turnSchema).min(1, "Must have at least one turn"),
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
    return currentTurn !== null && currentTurn.status === "ACTIVE";
  }, {
    message: "Current turn is not active",
    path: ["currentRound", "turns"],
  })
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn !== null && currentTurn.clue !== null && currentTurn.clue !== undefined;
  }, {
    message: "No clue has been given for this turn",
    path: ["currentRound", "turns"],
  })
  .refine((data) => {
    const currentTurn = getCurrentTurn(data);
    return currentTurn !== null && currentTurn.guessesRemaining > 0;
  }, {
    message: "No guesses remaining for this turn",
    path: ["currentRound", "turns"],
  });

export type MakeGuessValidGameState = ValidatedGameState<
  typeof makeGuessActionSchema
>;

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

export const validateMakeGuess = (
  data: GameAggregate,
  actingTeamId: number,
): GameplayValidationResult<MakeGuessValidGameState> => {
  const schemaResult = validateWithZodSchema(makeGuessActionSchema, data);
  if (!schemaResult.valid) return schemaResult;

  const currentTurn = getCurrentTurn(data);
  if (!currentTurn || currentTurn._teamId !== actingTeamId) {
    return {
      valid: false,
      errors: [
        {
          path: "currentRound.turns",
          message: "It's not your team's turn",
        },
      ],
    };
  }
  return schemaResult;
};
