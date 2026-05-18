import { GAME_STATE, ROUND_STATE } from "@codenames/shared/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  turnSchema,
  type GameAggregate,
} from "@backend/game/state/types";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { z } from "zod";

const endTurnSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
    turns: z.array(turnSchema).min(1, "Must have turns to end"),
  }),
});

/**
 * Branded aggregate shape returned by `validateEndTurn`.
 *
 * Guarantees game and current round are `IN_PROGRESS` and the round has
 * at least one turn (i.e. there's something that can be ended).
 */
export type EndTurnValidGameState = ValidatedGameState<typeof endTurnSchema>;

/**
 * Validates that the aggregate is in a state where the current turn can
 * be ended. Returns flattened errors when not.
 */
export const validateEndTurn = (
  data: GameAggregate,
): GameplayValidationResult<EndTurnValidGameState> => {
  return validateWithZodSchema(endTurnSchema, data);
};
