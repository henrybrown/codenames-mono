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

export type EndRoundValidGameState = ValidatedGameState<typeof endRoundSchema>;

export const validateEndRound = (
  data: GameAggregate,
): GameplayValidationResult<EndRoundValidGameState> => {
  return validateWithZodSchema(endRoundSchema, data);
};
