import { GAME_STATE, ROUND_STATE } from "@codenames/shared/types";
import {
  gameplayBaseSchema,
  currentRoundSchema,
  type GameAggregate,
} from "@backend/game/state/types";
import {
  validateWithZodSchema,
  ValidatedGameState,
  GameplayValidationResult,
} from "@backend/game/state/validation";
import { z } from "zod";

const endRoundSchema = gameplayBaseSchema.extend({
  status: z.literal(GAME_STATE.IN_PROGRESS),
  currentRound: currentRoundSchema.extend({
    status: z.literal(ROUND_STATE.IN_PROGRESS),
  }),
});

/**
 * Branded aggregate shape returned by `validateEndRound`.
 *
 * Guarantees the game is `IN_PROGRESS` and has a current round also
 * `IN_PROGRESS` (i.e. eligible to be ended).
 */
export type EndRoundValidGameState = ValidatedGameState<typeof endRoundSchema>;

/**
 * Validates that the aggregate is in a state where the current round can
 * be ended. Returns flattened errors when not.
 */
export const validateEndRound = (
  data: GameAggregate,
): GameplayValidationResult<EndRoundValidGameState> => {
  return validateWithZodSchema(endRoundSchema, data);
};
