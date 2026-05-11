import { GAME_STATE, ROUND_STATE } from "@codenames/shared/types";
import { GameAggregate } from "@backend/game/state/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
} from "@backend/game/state/types";
import { getCurrentTurn } from "@backend/game/state/helpers";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { z } from "zod";

/**
 * Schema for the game state required to give a clue.
 *
 * Validates game-shape only: in-progress game, in-progress round, with
 * a current active turn that has no clue yet. Does NOT validate who's
 * giving the clue — request-time identity is enforced by the
 * requireGameRole(CODEMASTER) middleware at the route layer, not here.
 */
const clueGivingSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
  }),
});

const clueGivingAllowedSchema = clueGivingSchema
  .refine(
    (game) => {
      const currentTurn = getCurrentTurn(game);
      return currentTurn !== null && !currentTurn.clue;
    },
    {
      message: "A clue has already been given for this turn",
      path: ["currentRound", "turns"],
    },
  )
  .refine(
    (game) => {
      const currentTurn = getCurrentTurn(game);
      return currentTurn !== null && currentTurn.status === "ACTIVE";
    },
    {
      message: "The current turn is not active",
      path: ["currentRound", "turns"],
    },
  );

export type GiveClueValidGameState = ValidatedGameState<
  typeof clueGivingAllowedSchema
>;

/**
 * Validates game state + acting team for clue giving.
 *
 * `actingTeamId` is the team the acting player belongs to; we check
 * that the current active turn belongs to that team. This is a
 * game-rule check ("it's not your team's turn"), not an auth check.
 */
export function validate(
  data: GameAggregate,
  actingTeamId: number,
): GameplayValidationResult<GiveClueValidGameState> {
  const schemaResult = validateWithZodSchema(clueGivingAllowedSchema, data);
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
}

/**
 * Pure clue-word check against the board. No player context needed.
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
